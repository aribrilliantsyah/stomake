import type Konva from 'konva';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Group, Image as KImage, Layer as KLayer, Line, Rect, Stage, Transformer } from 'react-konva';
import { panelSpace } from '../../shared/layout';
import type { Background, Layer, Panel, Scene } from '../../shared/types';
import { useAssetImage } from '../state/imageCache';
import { layersInRect, type Box } from '../../shared/multi';
import { LayerNode, type SelectMode } from './LayerNode';

const ACCENT = '#ae4f2c';

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

/** selection + editing callbacks shared by PanelContent / SceneCanvas / PageSheet */
export interface LayerEditing {
  selectedLayerIds?: string[];
  onSelectLayer?: (panelId: string, id: string | null, mode?: SelectMode) => void;
  /** marquee result; `additive` = Shift/Ctrl held */
  onSelectMany?: (panelId: string, ids: string[], additive: boolean) => void;
  /** one undo step for every layer touched by a drag / transform */
  onChangeLayers?: (panelId: string, patches: Record<string, Partial<Layer>>) => void;
}

interface PanelProps extends LayerEditing {
  panel: Panel;
  split: boolean;
  slug: string;
  interactive: boolean;
}

type Rect4 = { x: number; y: number; width: number; height: number };

/** Draws one panel in panel space (1080 x 1920|960); caller applies scale/offset. */
export function PanelContent({ panel, split, slug, interactive, selectedLayerIds = [], onSelectLayer, onSelectMany, onChangeLayers }: PanelProps) {
  const space = panelSpace(split);
  const nodes = useRef(new Map<string, Konva.Node>());
  const tr = useRef<Konva.Transformer>(null);
  const root = useRef<Konva.Group>(null);
  const register = useCallback((id: string, n: Konva.Node | null) => {
    if (n) nodes.current.set(id, n);
    else nodes.current.delete(id);
  }, []);

  // latest props for callbacks fired from Konva / microtasks
  const live = useRef({ panelId: panel.id, onChangeLayers, onSelectMany, layers: panel.layers });
  live.current = { panelId: panel.id, onChangeLayers, onSelectMany, layers: panel.layers };

  // drag/transform of N nodes fires N end events in one tick → one patch, one undo step
  const pending = useRef<Record<string, Partial<Layer>> | null>(null);
  const commit = useCallback((id: string, patch: Partial<Layer>) => {
    if (!pending.current) {
      pending.current = {};
      queueMicrotask(() => {
        const all = pending.current!;
        pending.current = null;
        live.current.onChangeLayers?.(live.current.panelId, all);
      });
    }
    pending.current[id] = { ...pending.current[id], ...patch } as Partial<Layer>;
  }, []);

  // outlines of each member when several layers are selected (the transformer draws only one box)
  const [outlines, setOutlines] = useState<Rect4[]>([]);
  const outlineKey = useRef('');
  const setOutlinesIfChanged = (next: Rect4[]) => {
    const key = JSON.stringify(next);
    if (key === outlineKey.current) return;
    outlineKey.current = key;
    setOutlines(next);
  };

  useEffect(() => {
    if (!tr.current) return;
    const ns = selectedLayerIds.map((id) => nodes.current.get(id)).filter((n): n is Konva.Node => !!n);
    tr.current.nodes(ns);
    tr.current.getLayer()?.batchDraw();
    setOutlinesIfChanged(ns.length > 1 && root.current ? ns.map((n) => roundRect(n.getClientRect({ relativeTo: root.current! }))) : []);
  });

  // marquee (rubber-band) selection on empty space
  const [marquee, setMarquee] = useState<Rect4 | null>(null);
  const startMarquee = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const additive = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
    if (!additive) onSelectLayer?.(panel.id, null);
    const g = root.current;
    const stage = g?.getStage();
    const p0 = g?.getRelativePointerPosition();
    if (!g || !stage || !p0) return;
    let rect: Rect4 = { x: p0.x, y: p0.y, width: 0, height: 0 };
    const move = () => {
      const p = g.getRelativePointerPosition();
      if (!p) return;
      rect = { x: p0.x, y: p0.y, width: p.x - p0.x, height: p.y - p0.y };
      setMarquee(rect);
    };
    const up = () => {
      stage.off('mousemove.marquee');
      window.removeEventListener('mouseup', up, true);
      setMarquee(null);
      if (Math.abs(rect.width) < 6 && Math.abs(rect.height) < 6) return; // a plain click
      const boxes: Box[] = live.current.layers.flatMap((l) => {
        const n = nodes.current.get(l.id);
        return n ? [{ id: l.id, ...n.getClientRect({ relativeTo: g }) }] : [];
      });
      live.current.onSelectMany?.(live.current.panelId, layersInRect(boxes, rect), additive);
    };
    stage.on('mousemove.marquee', move);
    window.addEventListener('mouseup', up, true);
  };

  const sel = panel.layers.filter((l) => selectedLayerIds.includes(l.id));
  const multi = sel.length > 1;
  const one = sel.length === 1 ? sel[0] : undefined;
  const freeAspect = !multi && (one?.type === 'arrow' || one?.type === 'shape');
  const sideAnchors = !multi && (one?.type === 'image' || one?.type === 'arrow' || one?.type === 'shape');

  return (
    <Group>
    <Group ref={root} clipX={0} clipY={0} clipWidth={space.w} clipHeight={space.h}>
      <Rect width={space.w} height={space.h} fill="transparent" onMouseDown={startMarquee} listening={interactive} />
      <BackgroundNode bg={panel.background} w={space.w} h={space.h} slug={slug} />
      {panel.layers.map((l) => (
        <LayerNode
          key={l.id}
          layer={l}
          slug={slug}
          interactive={interactive}
          registerNode={register}
          bounds={space}
          onSelect={(id, mode) => onSelectLayer?.(panel.id, id, mode)}
          onSelectSingle={(id) => onSelectLayer?.(panel.id, id, 'single')}
          onGestureStart={() => setOutlinesIfChanged([])}
          onChange={commit}
        />
      ))}
    </Group>
      {/* selection chrome lives outside the clip so handles stay grabbable on big layers */}
      {interactive &&
        outlines.map((o, i) => (
          <Rect key={i} {...o} stroke={ACCENT} strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} listening={false} />
        ))}
      {interactive && (
        <Transformer
          ref={tr}
          rotateEnabled
          keepRatio={!freeAspect}
          enabledAnchors={
            sideAnchors
              ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center', 'middle-left', 'middle-right']
              : ['top-left', 'top-right', 'bottom-left', 'bottom-right']
          }
          anchorSize={10}
          anchorStrokeWidth={1.5}
          borderStrokeWidth={multi ? 2 : 1.5}
          borderDash={multi ? [6, 4] : undefined}
          borderStroke={ACCENT}
          anchorStroke={ACCENT}
          anchorCornerRadius={0}
          rotationSnaps={[0, 90, 180, 270]}
          flipEnabled={false}
          boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4 ? oldBox : newBox)}
          ignoreStroke
        />
      )}
      {marquee && (
        <Rect {...marquee} fill="rgba(174,79,44,0.08)" stroke={ACCENT} strokeWidth={1} dash={[4, 3]} strokeScaleEnabled={false} listening={false} />
      )}
    </Group>
  );
}

function roundRect(r: Rect4): Rect4 {
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
}

interface SceneCanvasProps extends LayerEditing {
  scene: Scene;
  slug: string;
  /** rendered width in CSS px */
  width: number;
  interactive: boolean;
  pixelRatio?: number;
  activePanelId?: string | null;
  stageRef?: React.Ref<Konva.Stage>;
}

/** A whole 9:16 scene frame (1 or 2 stacked panels). */
export function SceneCanvas({ scene, slug, width, interactive, pixelRatio, activePanelId, selectedLayerIds, onSelectLayer, onSelectMany, onChangeLayers, stageRef }: SceneCanvasProps) {
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
              selectedLayerIds={panel.id === activePanelId ? selectedLayerIds : undefined}
              onSelectLayer={onSelectLayer}
              onSelectMany={onSelectMany}
              onChangeLayers={onChangeLayers}
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
            stroke={ACCENT}
            strokeWidth={2}
            dash={[6, 4]}
            listening={false}
          />
        )}
      </KLayer>
    </Stage>
  );
}
