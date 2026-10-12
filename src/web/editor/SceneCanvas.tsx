import type Konva from 'konva';
import { useCallback, useEffect, useRef } from 'react';
import { Group, Image as KImage, Layer as KLayer, Line, Rect, Stage, Transformer } from 'react-konva';
import { panelSpace } from '../../shared/layout';
import type { Background, Layer, Panel, Scene } from '../../shared/types';
import { useAssetImage } from '../state/imageCache';
import { LayerNode } from './LayerNode';

const SPACE_W = 1080;

export function BackgroundNode({ bg, w, h, slug }: { bg: Background; w: number; h: number; slug: string }) {
  const { image, status } = useAssetImage(bg.kind === 'asset' ? bg.ref : null, slug);
  if (bg.kind === 'color') return <Rect width={w} height={h} fill={bg.color} listening={false} />;
  if (!image) return <Rect width={w} height={h} fill={status === 'missing' ? '#cfcfcf' : '#eeeeee'} listening={false} />;
  const scale = bg.fit === 'cover' ? Math.max(w / image.width, h / image.height) : Math.min(w / image.width, h / image.height);
  const iw = image.width * scale;
  const ih = image.height * scale;
  return (
    <Group listening={false}>
      <Rect width={w} height={h} fill="#FFFFFF" />
      <KImage image={image} x={(w - iw) / 2} y={(h - ih) / 2} width={iw} height={ih} />
    </Group>
  );
}

interface PanelProps {
  panel: Panel;
  split: boolean;
  slug: string;
  interactive: boolean;
  selectedLayerId?: string | null;
  onSelectLayer?: (panelId: string, id: string | null) => void;
  onChangeLayer?: (panelId: string, layerId: string, patch: Partial<Layer>) => void;
}

/** Draws one panel in panel space (1080 x 1920|960); caller applies scale/offset. */
export function PanelContent({ panel, split, slug, interactive, selectedLayerId, onSelectLayer, onChangeLayer }: PanelProps) {
  const space = panelSpace(split);
  const nodes = useRef(new Map<string, Konva.Node>());
  const tr = useRef<Konva.Transformer>(null);
  const register = useCallback((id: string, n: Konva.Node | null) => {
    if (n) nodes.current.set(id, n);
    else nodes.current.delete(id);
  }, []);

  useEffect(() => {
    if (!tr.current) return;
    const n = selectedLayerId ? nodes.current.get(selectedLayerId) : undefined;
    tr.current.nodes(n ? [n] : []);
    tr.current.getLayer()?.batchDraw();
  });

  const selected = panel.layers.find((l) => l.id === selectedLayerId);

  return (
    <Group clipX={0} clipY={0} clipWidth={space.w} clipHeight={space.h}>
      <Rect
        width={space.w}
        height={space.h}
        fill="transparent"
        onMouseDown={() => onSelectLayer?.(panel.id, null)}
        listening={interactive}
      />
      <BackgroundNode bg={panel.background} w={space.w} h={space.h} slug={slug} />
      {panel.layers.map((l) => (
        <LayerNode
          key={l.id}
          layer={l}
          slug={slug}
          interactive={interactive}
          registerNode={register}
          onSelect={(id) => onSelectLayer?.(panel.id, id)}
          onChange={(id, patch) => onChangeLayer?.(panel.id, id, patch)}
        />
      ))}
      {interactive && (
        <Transformer
          ref={tr}
          rotateEnabled
          keepRatio={selected?.type !== 'arrow'}
          enabledAnchors={
            selected?.type === 'image' || selected?.type === 'arrow'
              ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center', 'middle-left', 'middle-right']
              : ['top-left', 'top-right', 'bottom-left', 'bottom-right']
          }
          anchorSize={10}
          borderStroke="#2f6fed"
          anchorStroke="#2f6fed"
          anchorCornerRadius={0}
          rotationSnaps={[0, 90, 180, 270]}
          ignoreStroke
        />
      )}
    </Group>
  );
}

interface SceneCanvasProps {
  scene: Scene;
  slug: string;
  /** rendered width in CSS px */
  width: number;
  interactive: boolean;
  pixelRatio?: number;
  activePanelId?: string | null;
  selectedLayerId?: string | null;
  onSelectLayer?: (panelId: string, id: string | null) => void;
  onChangeLayer?: (panelId: string, layerId: string, patch: Partial<Layer>) => void;
  stageRef?: React.Ref<Konva.Stage>;
}

/** A whole 9:16 scene frame (1 or 2 stacked panels). */
export function SceneCanvas({ scene, slug, width, interactive, pixelRatio, activePanelId, selectedLayerId, onSelectLayer, onChangeLayer, stageRef }: SceneCanvasProps) {
  const scale = width / SPACE_W;
  const height = (width * 16) / 9;
  const space = panelSpace(scene.split);
  return (
    <Stage width={width} height={height} pixelRatio={pixelRatio} ref={stageRef}>
      <KLayer>
        {scene.panels.map((panel, i) => (
          <Group key={panel.id} y={i * space.h * scale} scaleX={scale} scaleY={scale}>
            <PanelContent
              panel={panel}
              split={scene.split}
              slug={slug}
              interactive={interactive}
              selectedLayerId={panel.id === activePanelId ? selectedLayerId : null}
              onSelectLayer={onSelectLayer}
              onChangeLayer={onChangeLayer}
            />
          </Group>
        ))}
        {scene.split && (
          <Line points={[0, height / 2, width, height / 2]} stroke="#000" strokeWidth={Math.max(2, width / 72)} listening={false} />
        )}
        {interactive && scene.split && activePanelId && (
          <Rect
            y={scene.panels.findIndex((p) => p.id === activePanelId) * (height / 2)}
            width={width}
            height={height / 2}
            stroke="#2f6fed"
            strokeWidth={2}
            dash={[6, 4]}
            listening={false}
          />
        )}
      </KLayer>
    </Stage>
  );
}
