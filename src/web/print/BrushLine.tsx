/** Tapered black brush stroke (horizontal). Not an exact Canva copy, same feel. */
export function BrushLine({ width, thickness = 3.2 }: { width: number; thickness?: number }) {
  const t = thickness;
  const d = `M0 ${t / 2} C ${width * 0.15} ${t * 0.1}, ${width * 0.5} ${-t * 0.05}, ${width} ${t * 0.45}
             L ${width} ${t * 0.6} C ${width * 0.55} ${t * 1.1}, ${width * 0.2} ${t * 0.95}, 0 ${t * 0.55} Z`;
  return (
    <svg width={`${width}pt`} height={`${t}pt`} viewBox={`0 0 ${width} ${t}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <path d={d} fill="#111" />
    </svg>
  );
}

/** Rough hand-drawn rectangle border around a frame (in pt). */
export function BrushFrame({ w, h }: { w: number; h: number }) {
  const o = 1.6;
  return (
    <svg
      width={`${w + o * 4}pt`}
      height={`${h + o * 4}pt`}
      viewBox={`${-o * 2} ${-o * 2} ${w + o * 4} ${h + o * 4}`}
      style={{ position: 'absolute', left: `${-o * 2}pt`, top: `${-o * 2}pt`, pointerEvents: 'none', overflow: 'visible' }}
    >
      <path
        d={`M ${-o} ${-o * 0.6} L ${w + o * 0.8} ${-o} L ${w + o * 0.5} ${h + o} L ${-o * 0.7} ${h + o * 0.7} Z`}
        fill="none"
        stroke="#111"
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path d={`M ${-o * 0.4} ${-o * 1.1} L ${w * 0.6} ${-o * 0.4}`} stroke="#111" strokeWidth={1.4} fill="none" />
      <path d={`M ${w * 0.3} ${h + o * 1.2} L ${w + o * 0.2} ${h + o * 0.6}`} stroke="#111" strokeWidth={1.4} fill="none" />
    </svg>
  );
}
