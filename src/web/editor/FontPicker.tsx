import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILTIN_FONTS, fontStack } from '../../shared/fonts';
import { listLocalFonts, loadFont, localFontsSupported } from '../fonts';

let localCache: string[] | null = null;

export function FontPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [local, setLocal] = useState<string[] | null>(localCache);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const match = (f: string) => f.toLowerCase().includes(q.toLowerCase());
  const builtin = BUILTIN_FONTS.filter(match);
  const laptop = useMemo(() => (local ?? []).filter((f) => !(BUILTIN_FONTS as readonly string[]).includes(f)).filter(match).slice(0, 200), [local, q]);

  async function pick(name: string) {
    await loadFont(name);
    onChange(name);
    setOpen(false);
  }

  async function loadLocal() {
    setLoading(true);
    localCache = await listLocalFonts();
    setLocal(localCache);
    setLoading(false);
  }

  return (
    <div className="font-picker" ref={box}>
      <button className="font-current" style={{ fontFamily: fontStack(value) }} onClick={() => setOpen((v) => !v)}>
        {value}
      </button>
      {open && (
        <div className="menu font-menu">
          <input autoFocus placeholder="Cari font…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="font-list">
            <div className="font-group">Bawaan</div>
            {builtin.map((f) => (
              <button key={f} className={f === value ? 'on' : ''} style={{ fontFamily: fontStack(f) }} onClick={() => pick(f)}>
                {f}
              </button>
            ))}
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
                  laptop.map((f) => (
                    <button key={f} className={f === value ? 'on' : ''} style={{ fontFamily: fontStack(f) }} onClick={() => pick(f)}>
                      {f}
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
