import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { chromium, type Browser } from 'playwright';
import { PAGE } from '../shared/layout';
import { projectDir } from './paths';

export const EXPORT_TIMEOUT_MS = 120_000;

let browser: Promise<Browser> | null = null;

async function tryLaunch(errors: string[]): Promise<Browser | null> {
  // Playwright's own headless shell / Chromium, then whatever the OS has (Edge ships with Windows)
  for (const channel of [undefined, 'chromium', 'chrome', 'msedge']) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch (e) {
      errors.push(`${channel ?? 'default'}: ${(e as Error).message.split('\n')[0]}`);
    }
  }
  return null;
}

/** Downloads Playwright's headless shell once, with the Node running this server (desktop has no pnpm). */
async function installShell(): Promise<void> {
  // playwright-core is playwright's own dependency (not hoisted): resolve it from there
  const fromPlaywright = createRequire(createRequire(import.meta.url).resolve('playwright/package.json'));
  const cli = join(dirname(fromPlaywright.resolve('playwright-core/package.json')), 'cli.js');
  await promisify(execFile)(process.execPath, [cli, 'install', '--only-shell', 'chromium'], { timeout: 10 * 60_000 });
}

async function launch(): Promise<Browser> {
  const errors: string[] = [];
  let b = await tryLaunch(errors);
  if (!b) {
    console.log('Chromium tidak ditemukan, mengunduh sekali…');
    await installShell().catch((e) => errors.push(`install: ${(e as Error).message.split('\n')[0]}`));
    b = await tryLaunch(errors);
  }
  if (!b) throw new Error(`Chromium tidak bisa dijalankan. Pasang Google Chrome, atau periksa koneksi internet untuk unduhan otomatis. (${errors.join(' | ')})`);
  b.on('disconnected', () => {
    browser = null;
  });
  return b;
}

function getBrowser(): Promise<Browser> {
  browser ??= launch().catch((e) => {
    browser = null;
    throw e;
  });
  return browser;
}

export async function closeBrowser() {
  if (browser) {
    const b = await browser.catch(() => null);
    browser = null;
    await b?.close();
  }
}

export function exportPath(slug: string): string {
  return join(projectDir(slug), 'exports', 'storyboard.pdf');
}

/** Prints /print/:slug from baseUrl with Chromium into exports/storyboard.pdf. */
export async function exportPdf(slug: string, baseUrl: string): Promise<{ path: string; missingAssets: string[]; fonts: string[]; missingFonts: string[] }> {
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl}/print/${slug}`, { waitUntil: 'domcontentloaded', timeout: EXPORT_TIMEOUT_MS });
    await page.waitForFunction(() => window.__PRINT_READY__ === true || !!window.__PRINT_ERROR__, null, { timeout: EXPORT_TIMEOUT_MS });
    const err = await page.evaluate(() => window.__PRINT_ERROR__);
    if (err) throw new Error(err);
    const missingAssets = (await page.evaluate(() => window.__MISSING_ASSETS__ ?? [])) as string[];
    const fonts = (await page.evaluate(() => window.__FONTS__ ?? [])) as string[];
    const missingFonts = (await page.evaluate(() => window.__MISSING_FONTS__ ?? [])) as string[];
    const path = exportPath(slug);
    await mkdir(join(projectDir(slug), 'exports'), { recursive: true });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path, width: `${PAGE.w / 72}in`, height: `${PAGE.h / 72}in`, printBackground: true, preferCSSPageSize: true });
    return { path, missingAssets, fonts, missingFonts };
  } finally {
    await ctx.close();
  }
}

export const THUMB_WIDTH = 480;
const thumbJobs = new Map<string, Promise<string>>();

/** At most THUMB_CONCURRENCY thumbnails render at once so a full grid doesn't starve exports/saves. */
export const THUMB_CONCURRENCY = 2;
let thumbActive = 0;
const thumbQueue: (() => void)[] = [];
async function limitThumbs<T>(fn: () => Promise<T>): Promise<T> {
  if (thumbActive >= THUMB_CONCURRENCY) await new Promise<void>((res) => thumbQueue.push(res));
  thumbActive++;
  try {
    return await fn();
  } finally {
    thumbActive--;
    thumbQueue.shift()?.();
  }
}

export function thumbPath(slug: string): string {
  return join(projectDir(slug), 'thumb.png');
}

/**
 * Non-blocking thumbnail lookup. Returns the cached file (possibly stale) or null when none exists yet;
 * a missing or stale thumb starts a background render (cover if present). Concurrent calls share one render.
 */
export function thumbStatus(slug: string, baseUrl: string, firstPage: number): { file: string | null; rendering: boolean } {
  const out = thumbPath(slug);
  const proj = join(projectDir(slug), 'project.json');
  const exists = existsSync(out);
  const fresh = exists && statSync(out).mtimeMs >= statSync(proj).mtimeMs;
  if (!fresh && !thumbJobs.has(slug)) {
    const job = limitThumbs(() => renderThumb(slug, baseUrl, firstPage, out))
      .catch((err) => {
        console.warn(`thumbnail ${slug}: ${(err as Error).message}`);
        return out;
      })
      .finally(() => thumbJobs.delete(slug));
    thumbJobs.set(slug, job);
  }
  return { file: exists ? out : null, rendering: thumbJobs.has(slug) };
}

async function renderThumb(slug: string, baseUrl: string, firstPage: number, out: string): Promise<string> {
  const b = await getBrowser();
  const pageW = (PAGE.w * 96) / 72;
  const scale = THUMB_WIDTH / pageW;
  const ctx = await b.newContext({ viewport: { width: Math.ceil(pageW), height: Math.ceil((PAGE.h * 96) / 72) }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl}/print/${slug}?page=${firstPage}&thumb=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => window.__PRINT_READY__ === true || !!window.__PRINT_ERROR__, null, { timeout: 60_000 });
    const sheet = page.locator('.sheet').first();
    const tmp = `${out}.tmp.png`;
    await sheet.screenshot({ path: tmp, animations: 'disabled' });
    await rename(tmp, out);
    return out;
  } finally {
    await ctx.close();
  }
}
