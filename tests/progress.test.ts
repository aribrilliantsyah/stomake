// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { useProgress, trackLoading } from '../src/web/state/progress';

afterEach(() => {
  vi.useRealTimers();
  useProgress.setState({ pending: 0, visible: false });
});

test('trackLoading: bar baru tampil setelah 120 ms (load cepat tidak berkedip)', async () => {
  vi.useFakeTimers();
  let resolve!: () => void;
  const p = trackLoading(new Promise<void>((r) => (resolve = r)));
  expect(useProgress.getState().pending).toBe(1);
  vi.advanceTimersByTime(100);
  expect(useProgress.getState().visible).toBe(false);
  vi.advanceTimersByTime(30);
  expect(useProgress.getState().visible).toBe(true);
  resolve();
  await p;
  expect(useProgress.getState().pending).toBe(0);
  expect(useProgress.getState().visible).toBe(false);
});

test('trackLoading: selesai < 120 ms tidak pernah tampil; error tetap menurunkan pending', async () => {
  vi.useFakeTimers();
  await trackLoading(Promise.resolve(1));
  vi.advanceTimersByTime(500);
  expect(useProgress.getState().visible).toBe(false);
  await expect(trackLoading(Promise.reject(new Error('x')))).rejects.toThrow('x');
  expect(useProgress.getState().pending).toBe(0);
});

test('trackLoading: beberapa sekaligus — bar hilang setelah semua selesai', async () => {
  vi.useFakeTimers();
  let a!: () => void;
  let b!: () => void;
  const pa = trackLoading(new Promise<void>((r) => (a = r)));
  const pb = trackLoading(new Promise<void>((r) => (b = r)));
  vi.advanceTimersByTime(200);
  a();
  await pa;
  expect(useProgress.getState().visible).toBe(true);
  b();
  await pb;
  expect(useProgress.getState().visible).toBe(false);
});
