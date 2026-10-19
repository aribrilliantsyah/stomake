/**
 * Deterministic background patterns as SVG source (rendered to PNG by svgAsset).
 * Pure geometry: no script, no external image or font, so the sandboxed renderer draws all of it.
 */

export const PATTERN_KINDS = ['grid', 'graph', 'dots', 'diagonal', 'rays', 'checker', 'waves'] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

export interface PatternOptions {
  kind: PatternKind;
  width: number;
  height: number;
  /** base fill; with `color2` it becomes a vertical gradient */
  color: string;
  color2?: string;
  /** motif colour (lines, dots, squares) */
  ink: string;
  /** motif pitch in px */
  cell: number;
  /** motif line thickness in px */
  thickness: number;
  /** motif alpha 0..1 */
  inkOpacity: number;
  /** darkened corners so a subject in the middle reads better */
  vignette: boolean;
}

export const PATTERN_DEFAULTS = { width: 1080, height: 1920, cell: 90, thickness: 3, inkOpacity: 0.18, vignette: false } as const;

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The repeating motif, as the body of a <pattern> tile `cell` x `cell`. */
function tile(o: PatternOptions): string {
  const c = o.cell;
  const t = o.thickness;
  const ink = esc(o.ink);
  switch (o.kind) {
    case 'grid':
      return `<path d="M ${c} 0 L 0 0 0 ${c}" fill="none" stroke="${ink}" stroke-width="${t}"/>`;
    case 'graph':
      // five minor cells per tile plus a heavier major line on the tile edge
      return (
        `<path d="M ${c} 0 L 0 0 0 ${c}" fill="none" stroke="${ink}" stroke-width="${t * 2}"/>` +
        [1, 2, 3, 4]
          .map((i) => {
            const p = (c / 5) * i;
            return `<path d="M ${p} 0 L ${p} ${c} M 0 ${p} L ${c} ${p}" fill="none" stroke="${ink}" stroke-width="${t * 0.6}"/>`;
          })
          .join('')
      );
    case 'dots':
      return `<circle cx="${c / 2}" cy="${c / 2}" r="${Math.max(1, t * 1.6)}" fill="${ink}"/>`;
    case 'diagonal':
      return `<path d="M -${c} ${c} L ${c} -${c} M 0 ${c * 2} L ${c * 2} 0" fill="none" stroke="${ink}" stroke-width="${t * 2}"/>`;
    case 'checker':
      return `<path d="M 0 0 H ${c / 2} V ${c / 2} H 0 Z M ${c / 2} ${c / 2} H ${c} V ${c} H ${c / 2} Z" fill="${ink}"/>`;
    case 'waves': {
      const a = c / 4;
      return `<path d="M 0 ${c / 2} q ${c / 4} -${a} ${c / 2} 0 q ${c / 4} ${a} ${c / 2} 0" fill="none" stroke="${ink}" stroke-width="${t * 1.6}" stroke-linecap="round"/>`;
    }
    case 'rays':
      return '';
  }
}

/** Sunburst wedges from the centre; not tileable, so it is drawn once over the whole canvas. */
function rays(o: PatternOptions): string {
  const cx = o.width / 2;
  const cy = o.height / 2;
  const r = Math.hypot(o.width, o.height);
  const count = Math.max(6, Math.round((o.width / Math.max(8, o.cell)) * 2));
  const step = (Math.PI * 2) / count;
  const half = step / 4;
  const wedges = Array.from({ length: Math.floor(count / 2) }, (_, i) => {
    const a = i * step * 2;
    const p = (ang: number) => `${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r).toFixed(1)}`;
    return `M ${cx} ${cy} L ${p(a - half)} L ${p(a + half)} Z`;
  }).join(' ');
  return `<path d="${wedges}" fill="${esc(o.ink)}"/>`;
}

export function patternSvg(opts: Partial<PatternOptions> & { kind: PatternKind }): string {
  const o: PatternOptions = {
    color: '#F3EDE4',
    ink: '#1F1E1B',
    ...PATTERN_DEFAULTS,
    ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
  } as PatternOptions;
  const { width: w, height: h } = o;
  const base = o.color2
    ? `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${esc(o.color)}"/><stop offset="1" stop-color="${esc(o.color2)}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/>`
    : `<rect width="${w}" height="${h}" fill="${esc(o.color)}"/>`;
  const motif =
    o.kind === 'rays'
      ? `<g opacity="${o.inkOpacity}">${rays(o)}</g>`
      : `<defs><pattern id="p" width="${o.cell}" height="${o.cell}" patternUnits="userSpaceOnUse">${tile(o)}</pattern></defs>` +
        `<rect width="${w}" height="${h}" fill="url(#p)" opacity="${o.inkOpacity}"/>`;
  const vignette = o.vignette
    ? `<defs><radialGradient id="v" cx="0.5" cy="0.45" r="0.78"><stop offset="0.45" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.45"/></radialGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#v)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${base}${motif}${vignette}</svg>`;
}
