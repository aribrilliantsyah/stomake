import { Arrow, Circle, Ellipse, Group, Line, Path, Rect, Star } from 'react-konva';
import type { ShapeLayer } from '../../shared/types';

/** Speech bubble path: rounded box with a tail at the bottom-left, centered on 0,0. */
function bubblePath(w: number, h: number): string {
  const x = -w / 2;
  const y = -h / 2;
  const bh = h * 0.78;
  const r = Math.min(w, bh) * 0.18;
  const tx = x + w * 0.22;
  return [
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `V ${y + bh - r}`,
    `Q ${x + w} ${y + bh} ${x + w - r} ${y + bh}`,
    `H ${tx + w * 0.16}`,
    `L ${x + w * 0.1} ${y + h}`,
    `L ${tx} ${y + bh}`,
    `H ${x + r}`,
    `Q ${x} ${y + bh} ${x} ${y + bh - r}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

export function ShapeBody({ layer }: { layer: ShapeLayer }) {
  const { width: w, height: h, strokeWidth: sw } = layer;
  const common = {
    fill: layer.fill ?? undefined,
    stroke: layer.stroke ?? undefined,
    strokeWidth: layer.stroke ? sw : 0,
    dash: layer.dash ? [sw * 2, sw * 1.5] : undefined,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
  };
  const hit = Math.max(40, sw * 3);
  switch (layer.shape) {
    case 'rect':
      return <Rect x={-w / 2} y={-h / 2} width={w} height={h} {...common} />;
    case 'roundRect':
      return <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={Math.min(w, h) * 0.12} {...common} />;
    case 'ellipse':
      return <Ellipse radiusX={w / 2} radiusY={h / 2} {...common} />;
    case 'line':
      return <Line points={[-w / 2, -h / 2, w / 2, h / 2]} hitStrokeWidth={hit} {...common} />;
    case 'arrow':
    case 'doubleArrow': {
      const color = layer.stroke ?? '#000000';
      return (
        <Arrow
          points={[-w / 2, -h / 2, w / 2, h / 2]}
          pointerAtBeginning={layer.shape === 'doubleArrow'}
          pointerLength={sw * 3}
          pointerWidth={sw * 3}
          hitStrokeWidth={hit}
          {...common}
          stroke={color}
          strokeWidth={sw}
          fill={color}
        />
      );
    }
    case 'target': {
      const r = Math.min(w, h) / 2;
      return (
        <Group>
          {[1, 0.66, 0.33].map((k) => (
            <Circle key={k} radius={r * k} {...common} fill={k === 0.33 ? common.fill : undefined} />
          ))}
          <Circle radius={r} fill="transparent" />
        </Group>
      );
    }
    case 'cross':
      return (
        <Group>
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill="transparent" />
          <Line points={[-w / 2, -h / 2, w / 2, h / 2]} {...common} />
          <Line points={[w / 2, -h / 2, -w / 2, h / 2]} {...common} />
        </Group>
      );
    case 'star': {
      const outer = Math.min(w, h) / 2;
      return <Star numPoints={5} innerRadius={outer * 0.45} outerRadius={outer} scaleX={w / Math.max(1, Math.min(w, h))} scaleY={h / Math.max(1, Math.min(w, h))} {...common} />;
    }
    case 'bubble':
      return <Path data={bubblePath(w, h)} {...common} />;
  }
}
