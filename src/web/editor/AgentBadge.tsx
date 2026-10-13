import { Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import { relativeTime } from '../projects/homeState';
import { useEditor } from '../state/editorStore';

/** "AI sedang bekerja…" pill in the toolbar while an agent holds the project. */
export function AgentBadge() {
  const active = useEditor((s) => s.agentActive);
  const since = useEditor((s) => s.agentSince);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, [active]);
  if (!active) return null;
  return (
    <span className="agent-badge" role="status" title="Editor terkunci sampai AI selesai. Kamu masih bisa melihat, pindah slide, zoom, dan export.">
      <span className="agent-dot" aria-hidden />
      <Bot size={14} aria-hidden />
      AI sedang bekerja…
      {since && <span className="muted">· {relativeTime(since)}</span>}
    </span>
  );
}
