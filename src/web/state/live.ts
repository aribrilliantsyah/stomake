import { useEditor, type LiveEvent } from './editorStore';

/**
 * Subscribes the editor to server events for a project (agent lock, agent edits).
 * EventSource reconnects by itself; every (re)connect starts with a `hello` that resyncs the lock.
 */
export function connectLive(slug: string): () => void {
  if (typeof EventSource === 'undefined') return () => undefined;
  const es = new EventSource(`/api/projects/${slug}/events`);
  es.onmessage = (m) => {
    if (useEditor.getState().slug !== slug) return;
    try {
      useEditor.getState().onLive(JSON.parse(m.data) as LiveEvent);
    } catch {
      /* ignore malformed */
    }
  };
  return () => es.close();
}
