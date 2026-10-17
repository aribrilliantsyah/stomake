import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const BASE = 'http://127.0.0.1:5197';
const png = readFileSync(join(process.cwd(), 'tests/fixtures/red.png'));

test('asset: menu ⋯ → Hapus asset, peringatan dipakai, Urungkan memulihkan', async ({ page, request }) => {
  const { slug } = (await (await request.post('/api/projects', { data: { name: `Del ${Date.now()}` }, headers: { origin: BASE } })).json()) as { slug: string };
  const up = await request.post(`/api/assets/project/${slug}`, { multipart: { files: { name: 'kipas.png', mimeType: 'image/png', buffer: png } }, headers: { origin: BASE } });
  expect(up.ok()).toBe(true);
  // used once as a layer
  const p = await (await request.get(`/api/projects/${slug}`)).json();
  p.pages[0].scenes[0].panels[0].layers.push({ id: 'k', type: 'image', ref: 'project:kipas.png', x: 540, y: 960, width: 200, height: 400, rotation: 0, opacity: 1, flipX: false, flipY: false });
  await request.put(`/api/projects/${slug}`, { data: p, headers: { origin: BASE } });

  await page.goto(`/p/${slug}`);
  await page.getByRole('tab', { name: 'Asset' }).click();
  const tile = page.locator('.asset', { hasText: 'kipas.png' });
  await expect(tile).toHaveCount(1);
  await tile.hover();
  await tile.getByRole('button', { name: 'Menu asset' }).click();
  await page.getByRole('button', { name: 'Hapus asset…' }).click();
  const dlg = page.locator('.dialog');
  await expect(dlg).toContainText('Hapus asset?');
  await expect(dlg).toContainText('Masih dipakai di');
  await expect(dlg).toContainText('(1×)');
  await dlg.getByRole('button', { name: 'Hapus', exact: true }).click();
  await expect(page.locator('.asset', { hasText: 'kipas.png' })).toHaveCount(0);

  await page.locator('.toast', { hasText: 'dihapus' }).getByRole('button', { name: 'Urungkan' }).click();
  await expect(page.locator('.asset', { hasText: 'kipas.png' })).toHaveCount(1);
  await expect(page.locator('.toast', { hasText: 'dipulihkan' })).toBeVisible();

  // Delete key on a focused tile opens the same dialog; Batal keeps it
  await page.locator('.asset', { hasText: 'kipas.png' }).focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('.dialog')).toContainText('Hapus asset?');
  await page.locator('.dialog').getByRole('button', { name: 'Batal' }).click();
  await expect(page.locator('.asset', { hasText: 'kipas.png' })).toHaveCount(1);
});

test('upload lewat drag file lalu drag tile ke scene tetap berfungsi; drop zone 4 sisi lalu hilang', async ({ page, request }) => {
  const { slug } = (await (await request.post('/api/projects', { data: { name: `Dnd ${Date.now()}` }, headers: { origin: BASE } })).json()) as { slug: string };
  await page.goto(`/p/${slug}`);
  await page.getByRole('tab', { name: 'Asset' }).click();
  // OS file drag onto the panel (DataTransfer with a File, like Dolphin/Nautilus)
  const dt = await page.evaluateHandle((b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const d = new DataTransfer();
    d.items.add(new File([bin], 'kipas.png', { type: 'image/png' }));
    return d;
  }, png.toString('base64'));
  const panel = page.locator('.asset-panel');
  await panel.dispatchEvent('dragenter', { dataTransfer: dt });
  await panel.dispatchEvent('dragover', { dataTransfer: dt });
  const zone = page.locator('.drop-zone');
  await expect(zone).toBeVisible();
  const [z, p] = [(await zone.boundingBox())!, (await panel.boundingBox())!];
  expect(Math.round(z.x + z.width)).toBeLessThanOrEqual(Math.round(p.x + p.width));
  await expect(zone).toHaveCSS('border-right-style', 'dashed');
  await panel.dispatchEvent('drop', { dataTransfer: dt });
  await expect(zone).toHaveCount(0);
  await expect(page.locator('.asset', { hasText: 'kipas.png' })).toHaveCount(1);

  // then a tile → scene drag still adds a layer
  const frame = page.locator('.stage-box .sheet-frame').first();
  await page.locator('.asset', { hasText: 'kipas.png' }).dragTo(frame, { targetPosition: { x: 60, y: 140 } });
  await expect.poll(async () => (await (await request.get(`/api/projects/${slug}`)).json()).pages[0].scenes[0].panels[0].layers.length, { timeout: 8000 }).toBe(1);
});
