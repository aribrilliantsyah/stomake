import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BUILTIN_FONTS, fontStack } from '../../shared/fonts';
import { listLocalFonts, loadFont, localFontsSupported } from '../fonts';
import { placePopover, type Rect } from '../ui/Popover';

let localCache: string[] | null = null;

export const MENU_W = 260;
const MENU_H = 360;

/** Kept for tests/back-compat: same placement as every Popover. */
export function placeMenu(trigger: Rect, vw: number, vh: number, w = MENU_W, h = MENU_H) {
  return placePopover(trigger, vw, vh, w, h, 'start');
}

function FontRow({ name, active, onPick }: { name: string; active: boolean; onPick: (n: string) => void }) {
  return (
    <button className={`font-row${active ? ' on' : ''}`} onClick={() => onPick(name)} title={name}>
      <span className="font-sample" style={{ fontFamily: fontStack(name) }}>
        {name}
      </span>
    </button>
  );
}

export function FontPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [local, setLocal] = useState<string[] | null>(localCache);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const update = () => setPos(placeMenu(trigger.current!.getBoundingClientRect(), window.innerWidth, window.innerHeight));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const match = (f: string) => f.toLowerCase().includes(q.toLowerCase());
  const builtin = BUILTIN_FONTS.filter(match);
  const laptop = useMemo(() => (local ?? []).filter((f) => !(BUILTIN_FONTS as readonly string[]).includes(f)).filter(match).slice(0, 300), [local, q]);

  async function pick(name: string) {
    await loadFont(name);
    onChange(name);
    setOpen(false);
    setQ('');
  }

  async function loadLocal() {
    setLoading(true);
    localCache = await listLocalFonts();
    setLocal(localCache);
    setLoading(false);
  }

  return (
    <div className="font-picker">
      <button ref={trigger} className="font-current" onClick={() => setOpen((v) => !v)} title={value}>
        <span className="font-sample" style={{ fontFamily: fontStack(value) }}>
          {value}
        </span>
        <span className="caret">▾</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={menu} className="font-menu" style={{ left: pos.left, top: pos.top, width: MENU_W, maxHeight: pos.maxHeight }}>
            <input autoFocus data-native-undo placeholder="Cari font…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="font-list">
              <div className="font-group">Bawaan</div>
              {builtin.map((f) => (
                <FontRow key={f} name={f} active={f === value} onPick={pick} />
              ))}
              {!builtin.length && <div className="muted pad-s">Tidak ditemukan.</div>}
              {localFontsSupported() && (
                <>
                  <div className="font-group">Laptop</div>
                  {local === null ? (
                    <button className="font-load" onClick={loadLocal} disabled={loading}>
                      {loading ? 'Memuat…' : 'Muat font laptop'}
                    </button>
                  ) : local.length === 0 ? (
                    <div className="muted pad-s">Tidak ada / izin ditolak.</div>
                  ) : (
                    laptop.map((f) => <FontRow key={f} name={f} active={f === value} onPick={pick} />)
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
