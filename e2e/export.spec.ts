import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

test('buat project, 4 scene → 2 page, export PDF', async ({ page, request }) => {
  const name = `E2E ${Date.now()}`;
  await page.goto('/');
  await page.getByPlaceholder(/Nama project baru/).fill(name);
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(page).toHaveURL(/\/p\/e2e-/);
  await expect(page.locator('.stage-frame canvas')).toHaveCount(1);

  const sub = page.getByPlaceholder('Tempel potongan storyline di sini');
  await sub.fill('kenapa orang yang hipotermia');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ Scene' }).click();
  await expect(page.locator('.scene-title')).toHaveText('Scene 4');
  await expect(page.locator('.page-strip')).toContainText('P2');
  await sub.fill('padahal ini tipis kan');
  await page.getByRole('button', { name: 'T Teks' }).click();
  await expect(page.locator('.layer-list li')).toHaveCount(1);
  await expect(page.locator('.save-status')).toHaveText('Tersimpan', { timeout: 10_000 });

  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect(page.locator('.toast.ok')).toBeVisible({ timeout: 60_000 });
  const path = (await page.locator('.toast.ok span').innerText()).replace('PDF dibuat: ', '');
  expect(execFileSync('pdfinfo', [path]).toString()).toMatch(/Pages:\s+2/);
  const p2 = execFileSync('pdftotext', ['-f', '2', '-l', '2', path, '-']).toString();
  expect(p2).toContain('Scene 4');
  expect(p2).toContain('padahal ini tipis kan');

  const slug = new URL(page.url()).pathname.split('/')[2];
  const dl = await request.get(`/api/projects/${slug}/export.pdf`);
  expect(dl.headers()['content-type']).toBe('application/pdf');
});

test('undo via Ctrl+Z menghapus layer yang baru ditambah', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Nama project baru/).fill(`Undo ${Date.now()}`);
  await page.getByRole('button', { name: 'New Project' }).click();
  await page.getByRole('button', { name: '↑ Panah' }).click();
  await expect(page.locator('.layer-list li')).toHaveCount(1);
  await page.locator('.stage-box').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.layer-list li.empty')).toHaveCount(1);
});
