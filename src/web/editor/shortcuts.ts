/**
 * Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y = redo.
 * Fields bound to the project (subtitle, note, layer props) use the app undo, because React
 * controlled inputs break the browser's own undo. Free-text fields marked `.storyline-text` or
 * `[data-native-undo]` keep the browser undo (returns null).
 */
export function undoRedoAction(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k !== 'z' && k !== 'y') return null;
  const t = e.target as HTMLElement | null;
  if (t && typeof t.closest === 'function' && t.closest('.storyline-text, [data-native-undo]')) return null;
  if (k === 'y') return 'redo';
  return e.shiftKey ? 'redo' : 'undo';
}
