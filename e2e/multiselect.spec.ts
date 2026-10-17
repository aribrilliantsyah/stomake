import { expect, test, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:5197';

type L = { id: string; x: number; y: number; groupId?: string };
async function layers(page: Page, slug: string): Promise<L[]> {
  const p = await (await page.request.get(`/api/projects/${slug}`)).json();
  return p.pages[0].scenes[0].panels[0].layers;
}
async function saved(page: Page) {
  await expect(page.locator('.save-status')).toHaveText(/Tersimpan/, { timeout: 10_000 });
}
/** canvas px of a layer centre (panel space 1080 wide) */
async function at(page: Page, l: L) {
  const box = (await page.locator('.stage-frame canvas').first().boundingBox())!;
  const k = box.width / 1080;
  return { x: box.x + l.x * k, y: box.y + l.y * k, k };
}

test('multi-select: Shift+klik & drag bareng, Ctrl+G grup, copy-paste grup', async ({ page, request }) => {
  const { slug } = (await (await request.post('/api/projects', { data: { name: `Multi ${Date.now()}` }, headers: { origin: BASE } })).json()) as { slug: string };
  await page.goto(`/p/${slug}`);
  await expect(page.locator('.stage-box .sheet canvas')).toHaveCount(1);
  await page.keyboard.press('z'); // zoom into the scene for precise clicks
  await expect(page.locator('.stage-frame canvas').first()).toBeVisible();

  // three emoji, placed apart with arrow keys
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Emoji', exact: true }).click();
    await page.locator('.emoji-menu button').nth(i).click();
  }
  await saved(page);
  let ls = await layers(page, slug);
  expect(ls).toHaveLength(3);
  const canvas = page.locator('.stage-frame canvas').first();
  // spread them: select each from the list and nudge
  const list = page.locator('.layer-list li');
  await list.nth(0).click(); // front-most = 3rd emoji
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await list.nth(2).click(); // back-most = 1st emoji
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft');
  await saved(page);
  ls = await layers(page, slug);
  const [a, b, c] = ls;
  expect(a.x).toBe(240);
  expect(c.x).toBe(840);

  // click a, shift+click b, drag b → both move by the same delta, c stays
  await canvas.click({ position: { x: 1, y: 1 } }); // focus canvas area
  const pa = await at(page, a);
  const pb = await at(page, b);
  await page.mouse.click(pa.x, pa.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(pb.x, pb.y);
  await page.keyboard.up('Shift');
  await expect(page.locator('.h3-count')).toHaveText('2 dipilih');
  await page.mouse.move(pb.x, pb.y);
  await page.mouse.down();
  await page.mouse.move(pb.x + 20, pb.y + 30, { steps: 6 });
  await page.mouse.up();
  await saved(page);
  ls = await layers(page, slug);
  const dx = ls[0].x - a.x;
  const dy = ls[0].y - a.y;
  expect(Math.abs(dx)).toBeGreaterThan(30);
  expect(ls[1].x - b.x).toBe(dx);
  expect(ls[1].y - b.y).toBe(dy);
  expect(ls[2]).toMatchObject({ x: c.x, y: c.y });

  // one undo step brings both back
  await page.keyboard.press('Control+z');
  await saved(page);
  ls = await layers(page, slug);
  expect(ls[0]).toMatchObject({ x: a.x, y: a.y });
  expect(ls[1]).toMatchObject({ x: b.x, y: b.y });

  // marquee over a + b, Ctrl+G
  await page.keyboard.press('Escape');
  const q = await at(page, a);
  await page.mouse.move(q.x - 150 * q.k, q.y - 150 * q.k);
  await page.mouse.down();
  await page.mouse.move(pb.x + 150 * q.k, pb.y + 150 * q.k, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.h3-count')).toHaveText('2 dipilih');
  await page.keyboard.press('Control+g');
  await saved(page);
  ls = await layers(page, slug);
  expect(ls[0].groupId).toBeTruthy();
  expect(ls[1].groupId).toBe(ls[0].groupId);
  expect(ls[2].groupId).toBeUndefined();
  await expect(page.locator('.layer-list li.group-row')).toHaveCount(1);

  // clicking one member selects the whole group
  await page.keyboard.press('Escape');
  await page.mouse.click(pa.x, pa.y);
  await expect(page.locator('.h3-count')).toHaveText('2 dipilih');
  await expect(page.locator('.multi-head')).toContainText('Grup · 2 layer');

  // copy + paste the group → a new group of 2 at +40,+40, selected
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await saved(page);
  ls = await layers(page, slug);
  expect(ls).toHaveLength(5);
  const [p1, p2] = ls.slice(3);
  expect(p1.groupId).toBeTruthy();
  expect(p2.groupId).toBe(p1.groupId);
  expect(p1.groupId).not.toBe(ls[0].groupId);
  expect(p1.x).toBe(ls[0].x + 40);
  await expect(page.locator('.layer-list li.group-row')).toHaveCount(2);
  await expect(page.locator('.h3-count')).toHaveText('2 dipilih');

  // ungroup via Ctrl+Shift+G
  await page.keyboard.press('Control+Shift+g');
  await saved(page);
  ls = await layers(page, slug);
  expect(ls[3].groupId).toBeUndefined();
});

test('drag layer keluar frame: berhenti di tepi panel, masih bisa digeser lagi', async ({ page, request }) => {
  const { slug } = (await (await request.post('/api/projects', { data: { name: `Edge ${Date.now()}` }, headers: { origin: BASE } })).json()) as { slug: string };
  await page.goto(`/p/${slug}`);
  await expect(page.locator('.stage-box .sheet canvas')).toHaveCount(1);
  await page.keyboard.press('z');
  await expect(page.locator('.stage-frame canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Emoji', exact: true }).click();
  await page.locator('.emoji-menu button').first().click();
  await saved(page);
  let [l] = await layers(page, slug);
  let p = await at(page, l);
  // release far outside the browser window
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(-400, -400, { steps: 8 });
  await page.mouse.up();
  await saved(page);
  [l] = await layers(page, slug);
  expect(l).toMatchObject({ x: 0, y: 0 });

  // its visible quarter is still grabbable
  p = await at(page, l);
  await page.mouse.move(p.x + 15, p.y + 15);
  await page.mouse.down();
  await page.mouse.move(p.x + 15 + 100, p.y + 15 + 100, { steps: 8 });
  await page.mouse.up();
  await saved(page);
  [l] = await layers(page, slug);
  expect(l.x).toBeGreaterThan(50);
  expect(l.y).toBeGreaterThan(50);
});

test('daftar Layer: drag & drop mengubah urutan, grup ikut utuh', async ({ page, request }) => {
  const { slug } = (await (await request.post('/api/projects', { data: { name: `Dnd ${Date.now()}` }, headers: { origin: BASE } })).json()) as { slug: string };
  await page.goto(`/p/${slug}`);
  await expect(page.locator('.stage-box .sheet canvas')).toHaveCount(1);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Emoji', exact: true }).click();
    await page.locator('.emoji-menu button').nth(i).click();
  }
  await saved(page);
  const [a, b, c] = (await layers(page, slug)).map((l) => l.id);
  const rows = page.locator('.layer-list li');
  // list is front-most first: [c, b, a]. Drag a (bottom row) onto the upper half of c → a becomes front-most
  const top = (await rows.nth(0).boundingBox())!;
  await rows.nth(2).dragTo(rows.nth(0), { targetPosition: { x: 20, y: 3 } });
  await saved(page);
  expect((await layers(page, slug)).map((l) => l.id)).toEqual([b, c, a]);
  expect(top.height).toBeGreaterThan(10);

  // group b + c, then drag the group row below a → group goes to the back, still grouped
  await rows.nth(1).click();
  await rows.nth(2).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+g');
  await saved(page);
  await expect(page.locator('.layer-list li.group-row')).toHaveCount(1);
  const groupRow = page.locator('.layer-list li.group-row');
  const aRow = page.locator('.layer-list li:not(.group-row)').first();
  const box = (await aRow.boundingBox())!;
  await groupRow.dragTo(aRow, { targetPosition: { x: 20, y: box.height - 3 } });
  await saved(page);
  const after = await layers(page, slug);
  expect(after.map((l) => l.id)).toEqual([b, c, a]);
  expect(after[0].groupId).toBeTruthy();
  expect(after[1].groupId).toBe(after[0].groupId);
  // and back in front
  await groupRow.dragTo(page.locator('.layer-list li:not(.group-row)').first(), { targetPosition: { x: 20, y: 3 } });
  await saved(page);
  expect((await layers(page, slug)).map((l) => l.id)).toEqual([a, b, c]);
});

test('Ctrl+C / Ctrl+V layer di scene menduplikasi walau clipboard sistem berisi gambar', async ({ page, request, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { slug } = (await (await request.post('/api/projects', { data: { name: `Copy ${Date.now()}` }, headers: { origin: BASE } })).json()) as { slug: string };
  await page.goto(`/p/${slug}`);
  await expect(page.locator('.stage-box .sheet canvas')).toHaveCount(1);
  // an old screenshot sitting on the OS clipboard
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 20;
    c.height = 20;
    c.getContext('2d')!.fillRect(0, 0, 20, 20);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
  });
  await page.getByRole('button', { name: 'Emoji', exact: true }).click();
  await page.locator('.emoji-menu button').first().click();
  await saved(page);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await saved(page);
  const ls = await layers(page, slug);
  expect(ls).toHaveLength(2);
  expect((ls[1] as unknown as { type: string }).type).toBe('emoji');
  expect(ls[1].x).toBe(ls[0].x + 40);
});
