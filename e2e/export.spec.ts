import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

async function newProject(page: Page, prefix: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Project Baru' }).first().click();
  await page.getByRole('dialog').getByRole('textbox').fill(`${prefix} ${Date.now()}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Buat' }).click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.locator('.stage-box .sheet canvas')).toHaveCount(1);
}

const sceneTitle = (page: Page) => page.locator('.scene-head .scene-title');

test('buat project, +Scene sampai 3, +Page, export PDF', async ({ page, request }) => {
  await newProject(page, 'E2E');
  const sub = page.getByPlaceholder('Tempel potongan storyline di sini');
  await sub.fill('kenapa orang yang hipotermia');

  const addScene = page.getByRole('button', { name: 'Scene', exact: true });
  await addScene.click();
  await addScene.click();
  await expect(sceneTitle(page)).toHaveText('Scene 3');
  await expect(page.locator('.stage-box .sheet-frame')).toHaveCount(3);
  await expect(addScene).toBeDisabled();

  await page.getByRole('button', { name: 'Page', exact: true }).click();
  await expect(sceneTitle(page)).toHaveText('Scene 4');
  await expect(page.locator('.slide')).toHaveCount(2);
  await expect(page.locator('.stage-box .sheet-frame')).toHaveCount(1);
  await sub.fill('padahal ini tipis kan');
  await page.getByRole('button', { name: 'Teks' }).click();
  await expect(page.locator('.layer-list li')).toHaveCount(1);
  await expect(page.locator('.save-status')).toHaveText('Tersimpan', { timeout: 10_000 });

  await page.getByRole('button', { name: 'Export PDF' }).click();
  const ok = page.locator('.toast.ok').filter({ hasText: 'PDF dibuat' });
  await expect(ok).toBeVisible({ timeout: 60_000 });
  const path = (await ok.locator('span').innerText()).replace('PDF dibuat: ', '');
  expect(execFileSync('pdfinfo', [path]).toString()).toMatch(/Pages:\s+2/);
  const p2 = execFileSync('pdftotext', ['-f', '2', '-l', '2', path, '-']).toString();
  expect(p2).toContain('Scene 4');
  expect(p2).toContain('padahal ini tipis kan');
  // toast hilang sendiri
  await expect(ok).toHaveCount(0, { timeout: 6_000 });

  const slug = new URL(page.url()).pathname.split('/')[2];
  const dl = await request.get(`/api/projects/${slug}/export.pdf`);
  expect(dl.headers()['content-type']).toBe('application/pdf');
});

test('Ctrl+C layer di Scene 1, pilih Scene 2, Ctrl+V → layer muncul di Scene 2', async ({ page }) => {
  await newProject(page, 'Clip');
  await page.getByRole('button', { name: 'Scene', exact: true }).click();
  await page.locator('.stage-box .sheet-frame').nth(0).click({ position: { x: 5, y: 5 } });
  await expect(sceneTitle(page)).toHaveText('Scene 1');
  await page.getByRole('button', { name: 'Emoji' }).click();
  await page.locator('.emoji-menu button').first().click();
  await expect(page.locator('.layer-list li')).toHaveCount(1);
  await page.locator('.stage-box').click({ position: { x: 3, y: 3 } }); // blur inputs, keep selection
  await page.locator('.layer-list li').first().click();
  await page.keyboard.press('Control+c');
  await page.locator('.stage-box .sheet-frame').nth(1).click({ position: { x: 5, y: 5 } });
  await expect(sceneTitle(page)).toHaveText('Scene 2');
  await page.keyboard.press('Control+v');
  await expect(page.locator('.layer-list li')).toHaveCount(1);
  await expect(page.locator('.layer-list li').first()).toContainText('emoji');
});

test('Ctrl+2 melipat panel Storyline/Asset, Ctrl+Z undo', async ({ page }) => {
  await newProject(page, 'Fold');
  await expect(page.getByRole('button', { name: 'Import .docx' })).toBeVisible();
  await page.locator('.stage-box').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('Control+2');
  await expect(page.getByRole('button', { name: 'Import .docx' })).toHaveCount(0);
  await expect(page.locator('.collapsed')).toHaveCount(1);
  await page.keyboard.press('Control+2');
  await expect(page.getByRole('button', { name: 'Import .docx' })).toBeVisible();

  await page.getByRole('button', { name: 'Shape' }).click();
  await page.locator('.shape-menu button').nth(6).click(); // target
  await expect(page.locator('.layer-list li')).toHaveCount(1);
  await page.locator('.stage-box').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.layer-list li.empty')).toHaveCount(1);
});
