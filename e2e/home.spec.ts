import { expect, test, type APIRequestContext } from '@playwright/test';

const H = { origin: 'http://127.0.0.1:5197' };

async function seed(request: APIRequestContext, prefix: string, n: number) {
  for (let i = 1; i <= n; i++) {
    const r = await request.post('/api/projects', { data: { name: `${prefix} ${String(i).padStart(2, '0')}` }, headers: H });
    expect(r.ok()).toBe(true);
  }
}

test('home: cari, grid/list, pagination, arsip, hapus + urungkan', async ({ page, request }) => {
  const tag = `Home${Date.now() % 100000}`;
  await seed(request, tag, 26);

  await page.goto('/');
  await page.getByPlaceholder(/Cari project/).fill(tag);
  await expect(page).toHaveURL(new RegExp(`q=${tag}`));
  await expect(page.locator('.count')).toHaveText('26 project');
  // grid: 24 per page → 2 pages
  await expect(page.locator('.pcard')).toHaveCount(24);
  await page.getByRole('button', { name: 'Berikutnya' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('.pcard')).toHaveCount(2);
  await page.goBack();
  await expect(page.locator('.pcard')).toHaveCount(24);

  // list view: 50/page → one page, header sort by name
  await page.getByRole('button', { name: /List/ }).click();
  await expect(page.locator('table.plist tbody tr')).toHaveCount(26);
  await expect(page.locator('.pager')).toHaveCount(0);
  await page.locator('th.sortable', { hasText: 'Project' }).click();
  await expect(page.locator('table.plist tbody tr').first().locator('td.pname')).toHaveText(`${tag} 01`);

  // archive one via menu → hidden from Aktif, visible in Arsip
  const row = page.locator('table.plist tbody tr', { hasText: `${tag} 01` });
  await row.getByRole('button', { name: /Aksi/ }).click();
  await page.locator('.popover').getByRole('button', { name: 'Arsipkan' }).click();
  await expect(page.locator('.count')).toHaveText('25 project');
  await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Arsip' }).click();
  await expect(page.locator('table.plist tbody tr')).toHaveCount(1);
  await expect(page.locator('.badge').first()).toHaveText('ARSIP');
  await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Aktif' }).click();

  // bulk delete 2 → confirm → gone; Urungkan restores
  await page.getByRole('checkbox', { name: `Pilih ${tag} 02` }).check();
  await page.getByRole('checkbox', { name: `Pilih ${tag} 03` }).check();
  await expect(page.locator('.bulk-bar')).toContainText('2 dipilih');
  await page.locator('.bulk-bar').getByRole('button', { name: 'Hapus (2)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus' }).click();
  await expect(page.locator('.count')).toHaveText('23 project');
  await page.locator('.toast', { hasText: '2 project dihapus' }).getByRole('button', { name: 'Urungkan' }).click();
  await expect(page.locator('.count')).toHaveText('25 project');

  // rename via dialog
  const r4 = page.locator('table.plist tbody tr', { hasText: `${tag} 04` });
  await r4.getByRole('button', { name: /Aksi/ }).click();
  await page.locator('.popover').getByRole('button', { name: 'Ganti nama…' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill(`${tag} Empat`);
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();
  await expect(page.locator('table.plist tbody tr', { hasText: `${tag} Empat` })).toHaveCount(1);
});

test('home: kosong & tidak ada hasil', async ({ page }) => {
  await page.goto('/?q=tidak-ada-project-ini-xyz');
  await expect(page.locator('.home-empty')).toContainText('Tidak ada project yang cocok');
});
