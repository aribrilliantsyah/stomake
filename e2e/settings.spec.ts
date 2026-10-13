import { expect, test } from '@playwright/test';

const BASE = 'http://127.0.0.1:5197';
const init = { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' } };

test('Pengaturan: switch MCP, URL, tema gelap tersimpan, toggle tema', async ({ page, request }) => {
  await request.put('/api/settings', { data: { mcp: { enabled: false } }, headers: { origin: BASE } });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Pengaturan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Pengaturan' });
  await expect(dialog).toContainText('MCP');
  const sw = dialog.getByRole('switch', { name: 'Aktifkan MCP' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  expect((await page.request.fetch(`${BASE}/mcp`, { method: 'POST', data: init.body, headers: init.headers })).status()).toBe(404);

  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  expect((await page.request.fetch(`${BASE}/mcp`, { method: 'POST', data: init.body, headers: init.headers })).status()).toBe(200);
  await expect(dialog.locator('.mcp-url')).toHaveText(`${BASE}/mcp`);
  await expect(dialog.locator('.mcp-config')).toContainText('"storyboard-maker"');

  await dialog.getByRole('radio', { name: 'Gelap' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await dialog.getByRole('button', { name: 'Tutup' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Mode terang' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await request.put('/api/settings', { data: { mcp: { enabled: false } }, headers: { origin: BASE } });
});
