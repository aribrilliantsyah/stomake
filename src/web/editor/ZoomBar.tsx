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
        Pas
      </button>
      <button onClick={() => setPageZoom(nextZoom(pct, -1))} disabled={pct <= ZOOM_MIN} title="Perkecil (Ctrl+-)">
        −
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
      <button onClick={() => setPageZoom(nextZoom(pct, 1))} disabled={pct >= ZOOM_MAX} title="Perbesar (Ctrl+=)">
        +
      </button>
      <button className="zoom-pct mono" onClick={() => setPageZoom(100)} title="Ukuran asli (100%)">
        {Math.round(pct)}%
      </button>
    </footer>
  );
}
