import { useProgress } from '../state/progress';

/** Thin indeterminate bar pinned to the top of the window while anything tracked is loading. */
export function TopProgress() {
  const visible = useProgress((p) => p.visible);
  return <div className={`top-progress${visible ? ' on' : ''}`} role="progressbar" aria-hidden={!visible} aria-label="Memuat" />;
}

/** Editor-shaped placeholder: toolbar, slide column, page, props column. */
export function EditorSkeleton() {
  return (
    <div className="editor skeleton-editor" aria-busy="true" aria-label="Memuat project">
      <div className="toolbar">
        <span className="sk sk-line" style={{ width: 90 }} />
        <span className="sk sk-line" style={{ width: 160 }} />
        <span className="grow" />
        <span className="sk sk-line" style={{ width: 70 }} />
        <span className="sk sk-line" style={{ width: 90 }} />
      </div>
      <div className="sk-body">
        <div className="sk-col">
          {[0, 1, 2].map((i) => (
            <span key={i} className="sk sk-slide" />
          ))}
        </div>
        <div className="sk-center">
          <div className="sk sk-page">
            {[0, 1, 2].map((i) => (
              <span key={i} className="sk-frame" />
            ))}
          </div>
        </div>
        <div className="sk-col wide">
          {[120, 180, 140, 160, 100].map((w, i) => (
            <span key={i} className="sk sk-line" style={{ width: w }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="pgrid" aria-busy="true" aria-label="Memuat project">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="pcard sk-card">
          <div className="pthumb loading" />
          <div className="pcard-body">
            <span className="sk sk-line" style={{ width: '70%' }} />
            <span className="sk sk-line" style={{ width: '45%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden />;
}
