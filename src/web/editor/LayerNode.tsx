import type Konva from 'konva';
import { useEffect, useRef } from 'react';
import { Arrow, Group, Image as KImage, Rect, Text } from 'react-konva';
import type { Layer } from '../../shared/types';
import { fontStack } from '../../shared/fonts';
import { resizeShape } from '../../shared/model';
import { useAssetImage } from '../state/imageCache';
import { ShapeBody } from './ShapeBody';

export const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

export type SelectMode = 'replace' | 'toggle' | 'single';

interface Props {
  layer: Layer;
  slug: string;
  interactive: boolean;
  /** pointer down on the layer; Shift/Ctrl/Cmd = toggle */
  onSelect?: (id: string, mode: SelectMode) => void;
  /** double-click: edit one member of a group on its own */
  onSelectSingle?: (id: string) => void;
  onChange?: (id: string, patch: Partial<Layer>) => void;
  /** drag / transform started (parent hides stale outlines) */
  onGestureStart?: () => void;
  registerNode?: (id: string, node: Konva.Node | null) => void;
  /** panel space; a drag keeps the layer's centre inside it so it can always be grabbed again */
  bounds?: { w: number; h: number };
}

function MissingBox({ w, h, label }: { w: number; h: number; label: string }) {
  return (
    <Group>
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#d9d9d9" stroke="#888" strokeWidth={6} dash={[24, 16]} />
      <Text x={-w / 2} y={-30} width={w} align="center" text={`hilang: ${label}`} fontSize={48} fill="#444" />
    </Group>
  );
}

function ImageBody({ layer, slug }: { layer: Extract<Layer, { type: 'image' }>; slug: string }) {
  const { image, status } = useAssetImage(layer.ref, slug);
  const { width: w, height: h } = layer;
  if (status === 'missing') return <MissingBox w={w} h={h} label={layer.ref.slice(layer.ref.indexOf(':') + 1)} />;
  if (!image) return <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill="rgba(0,0,0,0.04)" />;
  return (
    <KImage
      image={image}
      x={layer.flipX ? w / 2 : -w / 2}
      y={layer.flipY ? h / 2 : -h / 2}
      width={w}
      height={h}
      scaleX={layer.flipX ? -1 : 1}
      scaleY={layer.flipY ? -1 : 1}
    />
  );
}

export function LayerNode({ layer, slug, interactive, onSelect, onSelectSingle, onChange, onGestureStart, registerNode, bounds }: Props) {
  const ref = useRef<Konva.Group>(null);
  useEffect(() => {
    registerNode?.(layer.id, ref.current);
    return () => registerNode?.(layer.id, null);
  }, [layer.id, registerNode]);

  let body: React.ReactNode;
  switch (layer.type) {
    case 'image':
      body = <ImageBody layer={layer} slug={slug} />;
      break;
    case 'text': {
      body = (
        <Text
          key={`${layer.font}|${layer.fontSize}|${layer.text}`}
          text={layer.text}
          fontFamily={fontStack(layer.font)}
          fontSize={layer.fontSize}
          fill={layer.fill}
          stroke={layer.stroke ?? undefined}
          strokeWidth={layer.stroke ? layer.strokeWidth : 0}
          fillAfterStrokeEnabled
          align="center"
          ref={(n) => {
            if (n) n.offset({ x: n.width() / 2, y: n.height() / 2 });
          }}
        />
      );
      break;
    }
    case 'arrow':
      body = (
        <Arrow
          points={layer.points}
          stroke={layer.color}
          fill={layer.color}
          strokeWidth={layer.strokeWidth}
          pointerLength={layer.strokeWidth * 3}
          pointerWidth={layer.strokeWidth * 3}
          lineCap="round"
          hitStrokeWidth={Math.max(40, layer.strokeWidth * 3)}
        />
      );
      break;
    case 'shape':
      body = <ShapeBody layer={layer} />;
      break;
    case 'emoji':
      body = (
        <Text
          text={layer.char}
          fontSize={layer.size}
          fontFamily={EMOJI_FONT}
          ref={(n) => {
            if (n) n.offset({ x: n.width() / 2, y: n.height() / 2 });
          }}
        />
      );
      break;
  }

  return (
    <Group
      ref={ref}
      name={`layer-${layer.id}`}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      opacity={layer.opacity}
      draggable={interactive}
      listening={interactive}
      onMouseDown={(e) => onSelect?.(layer.id, e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey ? 'toggle' : 'replace')}
      onTap={() => onSelect?.(layer.id, 'replace')}
      onDblClick={(e) => {
        if (!layer.groupId) return;
        // a grouped layer: double-click picks just this member (and doesn't open the scene)
        e.evt.stopPropagation();
        e.cancelBubble = true;
        onSelectSingle?.(layer.id);
      }}
      onDragStart={() => onGestureStart?.()}
      onDragMove={(e) => {
        if (!bounds) return;
        const n = e.target;
        n.x(Math.min(bounds.w, Math.max(0, n.x())));
        n.y(Math.min(bounds.h, Math.max(0, n.y())));
      }}
      onTransformStart={() => onGestureStart?.()}
      onDragEnd={(e) => onChange?.(layer.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })}
      onTransformEnd={() => {
        const n = ref.current!;
        const sx = n.scaleX();
        const sy = n.scaleY();
        n.scale({ x: 1, y: 1 });
        const base = { x: Math.round(n.x()), y: Math.round(n.y()), rotation: Math.round(n.rotation() * 10) / 10 };
        switch (layer.type) {
          case 'image':
            onChange?.(layer.id, { ...base, width: Math.max(4, Math.round(layer.width * sx)), height: Math.max(4, Math.round(layer.height * sy)) });
            break;
          case 'text':
            onChange?.(layer.id, { ...base, fontSize: Math.max(8, Math.round(layer.fontSize * sy)) });
            break;
          case 'emoji':
            onChange?.(layer.id, { ...base, size: Math.max(8, Math.round(layer.size * sy)) });
            break;
          case 'shape':
            // lines: the hit box is synthetic, only the horizontal scale is meaningful
            onChange?.(layer.id, { ...base, ...resizeShape(layer, sx, sy) });
            break;
          case 'arrow': {
            const [x1, y1, x2, y2] = layer.points;
            onChange?.(layer.id, { ...base, points: [Math.round(x1 * sx), Math.round(y1 * sy), Math.round(x2 * sx), Math.round(y2 * sy)] });
            break;
          }
        }
      }}
    >
      {body}
    </Group>
  );
}
