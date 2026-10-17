// Fills src-tauri/resources/ for the desktop app:
//   dist/                      built web app
//   server/main.mjs            bundled Node server
//   node_modules/playwright*   (not bundleable: resolves its driver files from its own folder)
//   node/node[.exe]            the Node binary running this script (same OS/arch as the build)
// Run on each target OS; installers are not cross-built.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';

const out = 'src-tauri/resources';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'warn'], { stdio: 'inherit' });
cpSync('dist', join(out, 'dist'), { recursive: true });

execFileSync(process.execPath, ['scripts/bundle-server.mjs'], { stdio: 'inherit' });

// pnpm keeps packages behind symlinks: copy the real folders into a flat node_modules
const require = createRequire(import.meta.url);
const playwright = realpathSync(dirname(require.resolve('playwright/package.json')));
const core = realpathSync(dirname(createRequire(join(playwright, 'package.json')).resolve('playwright-core/package.json')));
for (const dir of [playwright, core]) cpSync(dir, join(out, 'node_modules', basename(dir)), { recursive: true, dereference: true });

mkdirSync(join(out, 'node'), { recursive: true });
cpSync(realpathSync(process.execPath), join(out, 'node', process.platform === 'win32' ? 'node.exe' : 'node'));

console.log(`staged ${out} (node ${process.version} ${process.platform}-${process.arch})`);
