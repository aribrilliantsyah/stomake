import { useEffect, useState } from 'react';
import type { ProjectSummary } from '../../shared/types';
import { Popover, useAnchor } from '../ui/Popover';

export interface ProjectActions {
  open(p: ProjectSummary): void;
  rename(p: ProjectSummary): void;
  duplicate(p: ProjectSummary): void;
  archive(p: ProjectSummary, archived: boolean): void;
  remove(p: ProjectSummary): void;
}

export function ProjectMenu({ p, actions }: { p: ProjectSummary; actions: ProjectActions }) {
  const a = useAnchor<HTMLButtonElement>();
  const run = (fn: () => void) => () => {
    a.close();
    fn();
  };
  return (
    <>
      <button
        ref={a.ref}
        className={`icon-btn${a.open ? ' on' : ''}`}
        title="Aksi"
        aria-label={`Aksi untuk ${p.name}`}
        onClick={(e) => {
          e.stopPropagation();
          a.toggle();
        }}
      >
        ⋯
      </button>
      <Popover anchor={a.el} open={a.open} onClose={a.close} width={180} height={240} align="end" className="menu-list">
        <button onClick={run(() => actions.open(p))} disabled={p.broken}>
          Buka
        </button>
        <button onClick={run(() => actions.rename(p))} disabled={p.broken}>
          Ganti nama…
        </button>
        <button onClick={run(() => actions.duplicate(p))} disabled={p.broken}>
          Duplikat
        </button>
        <button onClick={run(() => actions.archive(p, !p.archived))} disabled={p.broken}>
          {p.archived ? 'Pulihkan dari arsip' : 'Arsipkan'}
        </button>
        <div className="menu-sep" />
        <button className="danger" onClick={run(() => actions.remove(p))}>
          Hapus…
        </button>
      </Popover>
    </>
  );
}

/** Thumbnail with a neutral placeholder; polls while the server answers 202 (still rendering). */
export function ProjectThumb({ p, version }: { p: ProjectSummary; version: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (p.broken) return;
    let alive = true;
    let url: string | null = null;
    let timer: ReturnType<typeof setTimeout>;
    setFailed(false);
    const load = async (attempt: number) => {
      try {
        const r = await fetch(`/api/projects/${p.slug}/thumb.png?v=${encodeURIComponent(p.updatedAt)}-${version}`);
        if (!alive) return;
        if (r.status === 202) {
          if (attempt < 20) timer = setTimeout(() => load(attempt + 1), Math.min(4000, 600 * (attempt + 1)));
          else setFailed(true);
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        url = URL.createObjectURL(await r.blob());
        if (alive) setSrc(url);
      } catch {
        if (alive) setFailed(true);
      }
    };
    load(0);
    return () => {
      alive = false;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [p.slug, p.updatedAt, p.broken, version]);
  if (p.broken) return <div className="pthumb err">project.json rusak</div>;
  return (
    <div className={`pthumb ${src ? 'ok' : failed ? 'err' : 'loading'}`}>
      {src && <img src={src} alt="" draggable={false} />}
      {!src && <span className="pthumb-label">{failed ? 'tanpa pratinjau' : ''}</span>}
    </div>
  );
}
