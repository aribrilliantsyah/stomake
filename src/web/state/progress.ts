import { create } from 'zustand';

/** Delay before the top progress bar appears, so fast loads don't flicker. */
export const PROGRESS_DELAY_MS = 120;

interface ProgressState {
  pending: number;
  visible: boolean;
}

export const useProgress = create<ProgressState>(() => ({ pending: 0, visible: false }));

let showTimer: ReturnType<typeof setTimeout> | null = null;

function start() {
  const pending = useProgress.getState().pending + 1;
  useProgress.setState({ pending });
  if (pending === 1 && !showTimer) {
    showTimer = setTimeout(() => {
      showTimer = null;
      if (useProgress.getState().pending > 0) useProgress.setState({ visible: true });
    }, PROGRESS_DELAY_MS);
  }
}

function done() {
  const pending = Math.max(0, useProgress.getState().pending - 1);
  if (pending === 0) {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    useProgress.setState({ pending, visible: false });
  } else useProgress.setState({ pending });
}

/** Shows the global top progress bar while `p` is pending. Returns `p` unchanged. */
export async function trackLoading<T>(p: Promise<T>): Promise<T> {
  start();
  try {
    return await p;
  } finally {
    done();
  }
}
