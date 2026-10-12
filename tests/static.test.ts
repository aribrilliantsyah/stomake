import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createApp } from '../src/server/app';

test('static: URL rusak → 400, traversal tetap index.html', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sb-dist-'));
  writeFileSync(join(dir, 'index.html'), '<html>ok</html>');
  const app = createApp({ staticDir: dir });
  expect((await app.request('/%E0%A4%A')).status).toBe(400);
  const r = await app.request('/..%2f..%2fetc%2fpasswd');
  expect(await r.text()).toBe('<html>ok</html>');
});
