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

test('zoom page: default fit, step naik/turun seperti Word, batas 25–400%', async () => {
  const ui = await load();
  const { ZOOM_STEPS, nextZoom } = await import('../src/web/state/uiStore');
  expect(ZOOM_STEPS).toEqual([25, 50, 75, 100, 125, 150, 200, 300, 400]);
  expect(ui.getState().pageZoom).toBe('fit');
  expect(nextZoom(87, 1)).toBe(100);
  expect(nextZoom(87, -1)).toBe(75);
  expect(nextZoom(100, 1)).toBe(125);
  expect(nextZoom(400, 1)).toBe(400);
  expect(nextZoom(25, -1)).toBe(25);
  ui.getState().setPageZoom(150);
  expect(ui.getState().pageZoom).toBe(150);
  ui.getState().setPageZoom(9999);
  expect(ui.getState().pageZoom).toBe(400);
  ui.getState().setPageZoom(1);
  expect(ui.getState().pageZoom).toBe(25);
  ui.getState().setPageZoom('fit');
  expect(ui.getState().pageZoom).toBe('fit');
});

test('toast error tidak tergusur oleh toast sukses baru', async () => {
  const ui = await load();
  ui.getState().toast('err', 'gagal simpan');
  for (let i = 1; i <= 5; i++) ui.getState().toast('ok', `ok${i}`);
  const texts = ui.getState().toasts.map((t) => t.text);
  expect(texts).toContain('gagal simpan');
  expect(texts).toHaveLength(4);
});

test('toast dengan aksi (Urungkan): aksi dipanggil sekali lalu toast hilang', async () => {
  const ui = await load();
  let n = 0;
  const id = ui.getState().toast('ok', 'Project dihapus', undefined, { label: 'Urungkan', run: () => { n++; } });
  const t = ui.getState().toasts.find((x) => x.id === id)!;
  expect(t.action?.label).toBe('Urungkan');
  ui.getState().runToastAction(id);
  ui.getState().runToastAction(id);
  expect(n).toBe(1);
  expect(ui.getState().toasts.find((x) => x.id === id)).toBeUndefined();
});
