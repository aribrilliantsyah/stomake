import { getBrowser } from './export';

export const MAX_SVG_BYTES = 1024 * 1024;
export const MAX_PNG_SIDE = 2048;
/** output width when neither the caller nor the SVG's width attribute says how big it is */
export const DEFAULT_PNG_WIDTH = 1024;

export class SvgError extends Error {}

/** Width attribute (if numeric) and aspect ratio of the root <svg>: viewBox first, else width/height. */
function rootSize(svg: string): { width: number | null; ratio: number | null } {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const attr = (n: string) => root.match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
  const num = (v: string | undefined) => (v && /^\s*[\d.]+\s*(px)?\s*$/.test(v) ? parseFloat(v) : NaN);
  const w = num(attr('width'));
  const h = num(attr('height'));
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const ratio = vb?.length === 4 && vb[2] > 0 && vb[3] > 0 ? vb[3] / vb[2] : w > 0 && h > 0 ? h / w : null;
  return { width: w > 0 ? w : null, ratio };
}

/**
 * Renders SVG source to a transparent PNG with the shared Chromium.
 * The SVG is loaded as an <img> data URL: browsers never run scripts or fetch external
 * resources for image documents; all network access is blocked as well.
 * Output width: `width`, else the SVG's width attribute, else DEFAULT_PNG_WIDTH; longest side capped.
 */
export async function svgToPng(svg: string, width?: number): Promise<{ png: Buffer; width: number; height: number }> {
  if (Buffer.byteLength(svg, 'utf8') > MAX_SVG_BYTES) throw new SvgError('SVG terlalu besar (maks 1 MB)');
  if (!/<svg[\s>]/i.test(svg)) throw new SvgError('Isi bukan SVG (tidak ada tag <svg>)');
  const b = await getBrowser();
  const ctx = await b.newContext({ javaScriptEnabled: false, offline: true, deviceScaleFactor: 1, viewport: { width: 64, height: 64 } });
  try {
    await ctx.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    const page = await ctx.newPage();
    const src = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><img id="i" src="${src}" style="display:block"></body></html>`);
    const img = page.locator('#i');
    const natural = await img.evaluate((el: HTMLImageElement) =>
      el.decode().then(
        () => ({ w: el.naturalWidth, h: el.naturalHeight }),
        () => null,
      ),
    );
    if (!natural || !natural.w || !natural.h) throw new SvgError('SVG tidak bisa dirender, periksa sintaksnya');
    const root = rootSize(svg);
    const ratio = root.ratio ?? natural.h / natural.w;
    let w = Math.round(width ?? root.width ?? DEFAULT_PNG_WIDTH);
    let h = Math.round(w * ratio);
    const over = Math.max(w, h) / MAX_PNG_SIDE;
    if (over > 1) {
      w = Math.round(w / over);
      h = Math.round(h / over);
    }
    w = Math.max(1, w);
    h = Math.max(1, h);
    await page.setViewportSize({ width: w, height: h });
    await img.evaluate((el: HTMLImageElement, s) => {
      el.style.width = `${s.w}px`;
      el.style.height = `${s.h}px`;
    }, { w, h });
    const png = await img.screenshot({ omitBackground: true, type: 'png', animations: 'disabled' });
    return { png, width: w, height: h };
  } finally {
    await ctx.close();
  }
}
