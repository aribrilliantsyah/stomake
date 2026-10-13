import { useUi } from '../state/uiStore';

export function Toasts() {
  const toasts = useUi((u) => u.toasts);
  const dismiss = useUi((u) => u.dismissToast);
  const runAction = useUi((u) => u.runToastAction);
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.text}</span>
          {t.link && (
            <a href={t.link.href} target="_blank" rel="noreferrer">
              {t.link.label}
            </a>
          )}
          {t.action && (
            <button className="toast-action" onClick={() => runAction(t.id)}>
              {t.action.label}
            </button>
          )}
          <button onClick={() => dismiss(t.id)} title="Tutup">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
