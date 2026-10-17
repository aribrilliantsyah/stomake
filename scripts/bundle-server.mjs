// Bundles the Node server into one ESM file for the desktop app (src-tauri/resources/server).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

await build({
  entryPoints: ['src/server/main.ts'],
  outfile: 'src-tauri/resources/server/main.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // playwright resolves its browser registry and driver files from its own package folder at runtime
  external: ['playwright', 'playwright-core', 'chromium-bidi'],
  define: { __APP_VERSION__: JSON.stringify(version) },
  // CJS deps (mammoth, …) call require(); give the ESM bundle one
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
console.log('server bundle: src-tauri/resources/server/main.mjs');
