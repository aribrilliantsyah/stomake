/**
 * "Rotating" marker: an open elliptical arc (~290°) with an arrow head, centred on 0,0 inside a w x h box.
 * Used to say "this part spins" (fan blades, wheels...). ccw is the horizontal mirror of cw.
 */
const SWEEP = 290;
const START = -50; // degrees, 0 = 3 o'clock, screen coords (y down → increasing angle = clockwise)

const f = (n: number) => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(2));

export function rotatePath(w: number, h: number, strokeWidth: number, dir: 'cw' | 'ccw'): { arc: string; head: string } {
  const len = strokeWidth * 3.2; // head length
  const half = strokeWidth * 2.2; // head half width
  const pad = Math.max(len, half) + strokeWidth / 2;
  const rx = Math.max(1, w / 2 - pad);
  const ry = Math.max(1, h / 2 - pad);
  const m = dir === 'cw' ? 1 : -1;
  const rad = (d: number) => (d * Math.PI) / 180;
  const pt = (d: number) => ({ x: m * rx * Math.cos(rad(d)), y: ry * Math.sin(rad(d)) });
  const a0 = START;
  const a1 = START + SWEEP;
  const p0 = pt(a0);
  const p1 = pt(a1);
  // tangent in the direction of travel at the end of the arc
  let tx = -rx * Math.sin(rad(a1)) * m;
  let ty = ry * Math.cos(rad(a1));
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const nx = -ty;
  const ny = tx;
  // arc stops a little before the head base so a thick stroke doesn't poke out of the tip
  const tip = { x: p1.x + tx * len * 0.75, y: p1.y + ty * len * 0.75 };
  const back = { x: p1.x - tx * len * 0.25, y: p1.y - ty * len * 0.25 };
  const arc = `M ${f(p0.x)} ${f(p0.y)} A ${f(rx)} ${f(ry)} 0 1 ${dir === 'cw' ? 1 : 0} ${f(p1.x)} ${f(p1.y)}`;
  const head = `M ${f(tip.x)} ${f(tip.y)} L ${f(back.x + nx * half)} ${f(back.y + ny * half)} L ${f(back.x - nx * half)} ${f(back.y - ny * half)} Z`;
  return { arc, head };
}
