import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { PAGE } from '../shared/layout';
import { projectDir } from './paths';

export const EXPORT_TIMEOUT_MS = 120_000;

let browser: Promise<Browser> | null = null;
/** Try Playwright's headless shell, then full Chromium, then the system Chrome. */
async function launch(): Promise<Browser> {
  const attempts: (string | undefined)[] = [undefined, 'chromium', 'chrome'];
  const errors: string[] = [];
  for (const channel of attempts) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch (e) {
      errors.push(`${channel ?? 'default'}: ${(e as Error).message.split('\n')[0]}`);
    }
  }
  throw new Error(`Chromium tidak bisa dijalankan. Jalankan: pnpm exec playwright install chromium (${errors.join(' | ')})`);
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
export async function exportPdf(slug: string, baseUrl: string): Promise<{ path: string; missingAssets: string[] }> {
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl}/print/${slug}`, { waitUntil: 'domcontentloaded', timeout: EXPORT_TIMEOUT_MS });
    await page.waitForFunction(() => window.__PRINT_READY__ === true || !!window.__PRINT_ERROR__, null, { timeout: EXPORT_TIMEOUT_MS });
    const err = await page.evaluate(() => window.__PRINT_ERROR__);
    if (err) throw new Error(err);
    const missingAssets = (await page.evaluate(() => window.__MISSING_ASSETS__ ?? [])) as string[];
    const path = exportPath(slug);
    await mkdir(join(projectDir(slug), 'exports'), { recursive: true });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path, width: `${PAGE.w / 72}in`, height: `${PAGE.h / 72}in`, printBackground: true, preferCSSPageSize: true });
    return { path, missingAssets };
  } finally {
    await ctx.close();
  }
}
