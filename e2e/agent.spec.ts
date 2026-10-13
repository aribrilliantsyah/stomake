import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect, test } from '@playwright/test';

const BASE = 'http://127.0.0.1:5197';

async function mcp() {
  const c = new Client({ name: 'e2e-agent', version: '1' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  const call = async <T = Record<string, unknown>>(name: string, args: Record<string, unknown>) => {
    const r = (await c.callTool({ name, arguments: args })) as unknown as { isError?: boolean; structuredContent: T; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    return r.structuredContent;
  };
  return { c, call };
}

test('agent mengedit project yang terbuka: live, terkunci, badge, lalu undo setelah selesai', async ({ page, browser, request }) => {
  await request.put('/api/settings', { data: { mcp: { enabled: true } }, headers: { origin: BASE } });
  const { slug } = (await (await request.post('/api/projects', { data: { name: `Agent ${Date.now()}` }, headers: { origin: BASE } })).json()) as { slug: string };
  await page.goto(`/p/${slug}`);
  await expect(page.locator('.stage-box .sheet canvas')).toHaveCount(1);
  await expect(page.locator('.slide')).toHaveCount(1);

  const { c, call } = await mcp();
  const proj = await call<{ pages: { id: string; scenes: { id: string }[] }[] }>('get_project', { slug });
  const added = await call<{ pageId: string; sceneIds: string[] }>('add_page', { slug, scenes: 2 });
  await call('update_scene', { slug, sceneId: proj.pages[0].scenes[0].id, subtitle: 'dari agent' });

  await expect(page.locator('.agent-badge')).toContainText('AI sedang bekerja');
  await expect(page.locator('.slide')).toHaveCount(2);
  await expect(page.getByPlaceholder('Tempel potongan storyline di sini')).toHaveValue('dari agent');
  await expect(page.getByPlaceholder('Tempel potongan storyline di sini')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Scene', exact: true })).toBeDisabled();
  await page.locator('.stage-box').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.slide')).toHaveCount(2);

  // home in another tab shows the AI badge
  const home = await browser.newPage();
  await home.goto(`${BASE}/?q=${slug}`);
  await expect(home.locator('.pcard .badge.ai')).toHaveText('AI');
  await home.close();

  expect(added.sceneIds).toHaveLength(2);
  await call('finish_editing', { slug });
  await c.close();
  await expect(page.locator('.agent-badge')).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: 'AI selesai mengedit' })).toBeVisible();

  // undo the agent's two edits, one step each, and it persists
  await page.locator('.stage-box').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.slide')).toHaveCount(1);
  await expect(page.locator('.save-status')).toHaveText(/Tersimpan/, { timeout: 10_000 });
  await page.reload();
  await expect(page.locator('.slide')).toHaveCount(1);
  await request.put('/api/settings', { data: { mcp: { enabled: false } }, headers: { origin: BASE } });
});
