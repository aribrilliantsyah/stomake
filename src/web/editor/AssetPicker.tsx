import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AssetInfo, AssetRef } from '../../shared/types';
import type { AssetLists } from '../api';
import { Popover, useAnchor } from '../ui/Popover';

const nameOf = (ref: string) => ref.slice(ref.indexOf(':') + 1);

function Group({ title, items, value, onPick }: { title: string; items: AssetInfo[]; value: string; onPick(a: AssetInfo): void }) {
  if (!items.length) return null;
  return (
    <>
      <div className="font-group">{title}</div>
      <div className="asset-pick-grid">
        {items.map((a) => (
          <button key={a.ref} className={`asset-pick${a.ref === value ? ' on' : ''}`} onClick={() => onPick(a)} title={`${a.name} · ${a.width}×${a.height}`}>
            <span className="thumb">
              <img src={a.url} alt="" loading="lazy" draggable={false} />
            </span>
            <span className="asset-name">{a.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** Asset select with thumbnail previews (replaces a plain <select>). */
export function AssetPicker({ value, assets, onChange }: { value: AssetRef; assets: AssetLists; onChange(ref: AssetRef): void }) {
  const a = useAnchor<HTMLButtonElement>();
  const [q, setQ] = useState('');
  const current = [...assets.project, ...assets.global].find((x) => x.ref === value);
  const match = (x: AssetInfo) => x.name.toLowerCase().includes(q.toLowerCase());
  useEffect(() => {
    if (!a.open) return;
    const id = requestAnimationFrame(() => document.querySelector('.asset-picker-menu .asset-pick.on')?.scrollIntoView?.({ block: 'nearest' }));
    return () => cancelAnimationFrame(id);
  }, [a.open]);
  const proj = useMemo(() => assets.project.filter(match), [assets, q]);
  const glob = useMemo(() => assets.global.filter(match), [assets, q]);

  return (
    <>
      <button ref={a.ref} className="asset-picker-trigger" onClick={a.toggle} title={current ? `${current.name} · ${current.width}×${current.height}` : nameOf(value)}>
        <span className="thumb mini">{current ? <img src={current.url} alt="" draggable={false} /> : <span className="missing">?</span>}</span>
        <span className="ellipsis">{current ? current.name : `${nameOf(value)} (hilang)`}</span>
        <ChevronDown className="caret" size={14} aria-hidden />
      </button>
      <Popover
        anchor={a.el}
        open={a.open}
        onClose={() => {
          a.close();
          setQ('');
        }}
        width={300}
        height={420}
        align="end"
        className="asset-picker-menu"
      >
        <input autoFocus data-native-undo placeholder="Cari asset…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="asset-pick-list">
          <Group title="Project" items={proj} value={value} onPick={(x) => { onChange(x.ref); a.close(); setQ(''); }} />
          <Group title="Global" items={glob} value={value} onPick={(x) => { onChange(x.ref); a.close(); setQ(''); }} />
          {!proj.length && !glob.length && <div className="muted pad-s">Tidak ada asset.</div>}
        </div>
      </Popover>
    </>
  );
}
