import { Scan, ZoomIn, ZoomOut } from 'lucide-react';
import { nextZoom, useUi, ZOOM_MAX, ZOOM_MIN } from '../state/uiStore';

/** Word-style zoom footer. `fitPercent` is what 'fit' currently resolves to. */
export function ZoomBar({ fitPercent, info }: { fitPercent: number; info?: React.ReactNode }) {
  const pageZoom = useUi((u) => u.pageZoom);
  const setPageZoom = useUi((u) => u.setPageZoom);
  const pct = pageZoom === 'fit' ? fitPercent : pageZoom;
  return (
    <footer className="zoombar">
      <span className="muted small">{info}</span>
      <div className="grow" />
      <button className={pageZoom === 'fit' ? 'on' : ''} onClick={() => setPageZoom('fit')} title="Pas ke layar (Ctrl+0)">
        <Scan size={14} aria-hidden /> Pas
      </button>
      <button onClick={() => setPageZoom(nextZoom(pct, -1))} disabled={pct <= ZOOM_MIN} title="Perkecil (Ctrl+-)" aria-label="Perkecil">
        <ZoomOut size={14} aria-hidden />
      </button>
      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={5}
        value={pct}
        onChange={(e) => setPageZoom(Number(e.target.value))}
        title="Zoom"
        aria-label="Zoom"
      />
      <button onClick={() => setPageZoom(nextZoom(pct, 1))} disabled={pct >= ZOOM_MAX} title="Perbesar (Ctrl+=)" aria-label="Perbesar">
        <ZoomIn size={14} aria-hidden />
      </button>
      <button className="zoom-pct mono" onClick={() => setPageZoom(100)} title="Ukuran asli (100%)">
        {Math.round(pct)}%
      </button>
    </footer>
  );
}
