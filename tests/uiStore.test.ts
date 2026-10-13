// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const load = async () => (await import('../src/web/state/uiStore')).useUi;

test('default semua panel terbuka, zoom mati', async () => {
  const ui = await load();
  expect(ui.getState().panels).toEqual({ slides: true, library: true, props: true });
  expect(ui.getState().zoom).toBe(false);
});

test('togglePanel persist ke localStorage sb.panels', async () => {
  let ui = await load();
  ui.getState().togglePanel('library');
  expect(ui.getState().panels.library).toBe(false);
  expect(JSON.parse(localStorage.getItem('sb.panels')!)).toEqual({ slides: true, library: false, props: true });
  vi.resetModules();
  ui = await load();
  expect(ui.getState().panels.library).toBe(false);
});

test('localStorage rusak → default', async () => {
  localStorage.setItem('sb.panels', '{bad');
  const ui = await load();
  expect(ui.getState().panels).toEqual({ slides: true, library: true, props: true });
});

test('ok hilang setelah 4000ms, warn setelah 8000ms, err tetap', async () => {
  const ui = await load();
  const { toast } = ui.getState();
  toast('ok', 'tersimpan');
  toast('warn', 'asset hilang');
  toast('err', 'gagal');
  expect(ui.getState().toasts.map((t) => t.kind)).toEqual(['ok', 'warn', 'err']);
  vi.advanceTimersByTime(4000);
  expect(ui.getState().toasts.map((t) => t.kind)).toEqual(['warn', 'err']);
  vi.advanceTimersByTime(4000);
  expect(ui.getState().toasts.map((t) => t.kind)).toEqual(['err']);
  vi.advanceTimersByTime(60000);
  expect(ui.getState().toasts).toHaveLength(1);
});

test('maks 4 toast, tertua dibuang', async () => {
  const ui = await load();
  for (let i = 1; i <= 6; i++) ui.getState().toast('err', `e${i}`);
  expect(ui.getState().toasts.map((t) => t.text)).toEqual(['e3', 'e4', 'e5', 'e6']);
});

test('dismissToast menghapus dan membatalkan timer', async () => {
  const ui = await load();
  const id = ui.getState().toast('info', 'x', { href: '/a', label: 'Buka' });
  expect(ui.getState().toasts[0].link).toEqual({ href: '/a', label: 'Buka' });
  ui.getState().dismissToast(id);
  expect(ui.getState().toasts).toHaveLength(0);
  vi.advanceTimersByTime(5000);
  expect(ui.getState().toasts).toHaveLength(0);
});
