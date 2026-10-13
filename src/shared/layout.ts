/**
 * PDF page layout, in pt. Page size and column pitch from the Canva sample (708.75 x 567);
 * frames enlarged to 198 x 352 (9:16) so 3 still fit with 30pt gaps and symmetric margins.
 */
export const PAGE = { w: 708.75, h: 567 } as const;
export const TITLE = { text: 'STORYBOARD', y: 23, size: 30 } as const;
export const FRAME = { w: 198, h: 352, y: 102 } as const;
export const COL_PITCH = 228;
export const COL_X3 = (PAGE.w - (2 * COL_PITCH + FRAME.w)) / 2;
export const LABEL_Y = 70;
export const LABEL_SIZE = 12;
export const NOTE = { y: 84, size: 7, width: FRAME.w, maxLines: 2 } as const;
export const SUB = { y: 462, size: 11, minSize: 8, width: FRAME.w, maxLines: 4, lineHeight: 1.25 } as const;
export const BRUSH = { y: 530, width: 170 } as const;

/** Cover page: title + single centered frame, no labels. */
export const COVER = { titleY: 23, titleSize: 30, x: (PAGE.w - FRAME.w) / 2, y: 102 } as const;

export const PANEL_SPACE = { w: 1080, h: 1920 } as const;

/**
 * Left x of each scene column. 3 scenes use the measured Canva positions;
 * 1-2 scenes are centered on the page ("mulai dari tengah").
 */
export function columnXs(n: number): number[] {
  const count = Math.max(1, Math.min(3, n));
  if (count === 3) return [COL_X3, COL_X3 + COL_PITCH, COL_X3 + 2 * COL_PITCH];
  const first = PAGE.w / 2 - ((count - 1) * COL_PITCH + FRAME.w) / 2;
  return Array.from({ length: count }, (_, i) => first + i * COL_PITCH);
}

/** Panel rectangle inside the frame, frame-local pt. */
export function panelRect(split: boolean, index: 0 | 1): { x: number; y: number; w: number; h: number } {
  if (!split) return { x: 0, y: 0, w: FRAME.w, h: FRAME.h };
  const h = FRAME.h / 2;
  return { x: 0, y: index * h, w: FRAME.w, h };
}

export function panelSpace(split: boolean): { w: 1080; h: 1920 | 960 } {
  return split ? { w: 1080, h: 960 } : { w: 1080, h: 1920 };
}

export interface FitTextOptions {
  width: number;
  maxLines: number;
  size: number;
  minSize: number;
  measure: (s: string, size: number) => number;
}

function wrap(text: string, size: number, width: number, measure: FitTextOptions['measure']): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words: string[] = [];
    for (const w of para.split(/\s+/).filter(Boolean)) {
      // hard-break words wider than the column
      let rest = w;
      while (measure(rest, size) > width && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && measure(rest.slice(0, n), size) > width) n--;
        words.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      words.push(rest);
    }
    let line = '';
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (!line || measure(cand, size) <= width) line = cand;
      else {
        lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Shrink 0.5pt at a time until it fits in maxLines; at minSize, truncate with an ellipsis. */
export function fitText(text: string, o: FitTextOptions): { size: number; lines: string[] } {
  if (!text.trim()) return { size: o.size, lines: [] };
  for (let size = o.size; size >= o.minSize; size -= 0.5) {
    const lines = wrap(text, size, o.width, o.measure);
    if (lines.length <= o.maxLines) return { size, lines };
  }
  const size = o.minSize;
  const lines = wrap(text, size, o.width, o.measure).slice(0, o.maxLines);
  let last = lines[o.maxLines - 1];
  while (last.length > 0 && o.measure(`${last}…`, size) > o.width) last = last.slice(0, -1).trimEnd();
  lines[o.maxLines - 1] = `${last}…`;
  return { size, lines };
}
