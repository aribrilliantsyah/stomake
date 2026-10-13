import { useEffect, useRef, useState } from 'react';

/** Small modal for text input (new project / rename) and confirmations. */
export function Dialog({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  onClose(): void;
  footer: React.ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot">{footer}</div>
      </div>
    </div>
  );
}

export function PromptDialog({
  title,
  label,
  initial = '',
  placeholder,
  submitLabel,
  extra,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  initial?: string;
  placeholder?: string;
  submitLabel: string;
  extra?: React.ReactNode;
  onSubmit(value: string): Promise<void> | void;
  onClose(): void;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!v.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(v.trim());
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Batal</button>
          <button className="primary" onClick={() => submit()} disabled={!v.trim() || busy}>
            {busy ? '…' : submitLabel}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <label className="field col">
          <span>{label}</span>
          <input ref={input} data-native-undo value={v} placeholder={placeholder} maxLength={120} onChange={(e) => setV(e.target.value)} />
        </label>
        {extra}
        {err && <div className="error">{err}</div>}
      </form>
    </Dialog>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm(): void;
  onClose(): void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Batal</button>
          <button
            autoFocus
            className={danger ? 'primary danger-fill' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {message}
    </Dialog>
  );
}
