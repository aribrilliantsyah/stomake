import { useEffect, useRef } from 'react';

/**
 * Calls `reset` whenever any HTML5 drag in the window ends. A drag can end without `dragend`
 * reaching its source element (source re-rendered or removed mid-drag, drop outside the window),
 * which used to leave list drag state stuck so later drags did nothing.
 */
export function useDragReset(reset: () => void): void {
  const latest = useRef(reset);
  latest.current = reset;
  useEffect(() => {
    const now = () => latest.current();
    // after the drop handlers of this drag have run
    const later = () => setTimeout(now, 0);
    window.addEventListener('dragend', now, true);
    window.addEventListener('drop', later, true);
    return () => {
      window.removeEventListener('dragend', now, true);
      window.removeEventListener('drop', later, true);
    };
  }, []);
}
