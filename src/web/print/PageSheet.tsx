import { memo } from 'react';
import { BRUSH, columnXs, COVER, FRAME, LABEL_SIZE, LABEL_Y, NOTE, PAGE, SUB, TITLE, fitText } from '../../shared/layout';
import type { Background, Cover, Layer, Project, Scene } from '../../shared/types';
import { SceneCanvas, type LayerEditing } from '../editor/SceneCanvas';
import { assetUrl } from '../state/imageCache';
import { BrushFrame, BrushLine } from './BrushLine';

export const PT_TO_PX = 96 / 72;
const FONT = '"Coming Soon", cursive';

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width in pt of `s` set at `size` pt. */
function measure(s: string, size: number): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return s.length * size * 0.55;
  measureCtx.font = `${size * PT_TO_PX}px ${FONT}`;
  return measureCtx.measureText(s).width / PT_TO_PX;
}

function bgStyle(bg: Background, slug: string): React.CSSProperties {
  if (bg.kind === 'color') return { background: bg.color };
  return {
    backgroundColor: '#FFFFFF',
    backgroundImage: `url("${assetUrl(bg.ref, slug)}")`,
    backgroundSize: bg.fit,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

/** Editing hooks; when absent the sheet is a static print/thumbnail. */
export interface SheetInteraction extends LayerEditing {
  activeSceneId?: string | null;
  activePanelId?: string | null;
  onSelectScene?(sceneId: string): void;
  /** asset dropped onto a frame; `rect` is the frame canvas box in client px */
  onDropAsset?(sceneId: string, e: React.DragEvent, rect: DOMRect): void;
  onOpenScene?(sceneId: string): void;
  /** false = frames still selectable but layers locked (AI working) */
  editable?: boolean;
}

interface SheetProps extends SheetInteraction {
  project: Project;
  slug: string;
  /** 1 = real print size */
  scale?: number;
  pixelRatio?: number;
  interactive?: boolean;
}

function Frame({ scene, x, y, slug, scale, pixelRatio, interactive, it }: { scene: Scene; x: number; y: number; slug: string; scale: number; pixelRatio?: number; interactive: boolean; it: SheetInteraction }) {
  const u = (n: number) => `${n * scale}pt`;
  const active = interactive && it.activeSceneId === scene.id;
  return (
    <div
      className={`sheet-frame${active ? ' active' : ''}${interactive ? ' editable' : ''}`}
      style={{ left: u(x), top: u(y), width: u(FRAME.w), height: u(FRAME.h) }}
      onMouseDownCapture={() => interactive && it.activeSceneId !== scene.id && it.onSelectScene?.(scene.id)}
      onDoubleClick={() => interactive && it.onOpenScene?.(scene.id)}
      onDragOver={(e) => {
        if (interactive && it.onDropAsset && e.dataTransfer.types.includes('application/x-storyboard-asset')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!interactive || !it.onDropAsset || it.editable === false) return;
        const canvas = (e.currentTarget as HTMLElement).querySelector('.konvajs-content');
        if (canvas) it.onDropAsset(scene.id, e, canvas.getBoundingClientRect());
      }}
    >
      <SceneCanvas
        scene={scene}
        slug={slug}
        width={FRAME.w * PT_TO_PX * scale}
        interactive={interactive && it.editable !== false}
        pixelRatio={pixelRatio}
        activePanelId={active ? it.activePanelId : null}
        selectedLayerIds={active ? it.selectedLayerIds : undefined}
        onSelectLayer={it.onSelectLayer}
        onSelectMany={it.onSelectMany}
        onChangeLayers={it.onChangeLayers}
      />
      <BrushFrame w={FRAME.w * scale} h={FRAME.h * scale} scale={scale} />
    </div>
  );
}

/** One storyboard page (708.75pt x 567pt at scale 1). */
export function PageSheet({ project, pageIndex, slug, scale = 1, pixelRatio, interactive = false, ...it }: SheetProps & { pageIndex: number }) {
  const page = project.pages[pageIndex];
  const first = project.pages.slice(0, pageIndex).reduce((n, p) => n + p.scenes.length, 0);
  const xs = columnXs(page.scenes.length);
  const bg = page.background ?? project.pageBackground;
  const u = (n: number) => `${n * scale}pt`;

  return (
    <section className="sheet" style={{ width: u(PAGE.w), height: u(PAGE.h), ...bgStyle(bg, slug) }}>
      <div className="sheet-title" style={{ top: u(TITLE.y), fontSize: u(TITLE.size) }}>
        {TITLE.text}
      </div>
      {page.scenes.map((scene, i) => {
        const x = xs[i];
        const note = scene.note.trim() ? fitText(scene.note, { width: NOTE.width, maxLines: NOTE.maxLines, size: NOTE.size, minSize: 5, measure }) : { size: NOTE.size, lines: ['-'] };
        const sub = fitText(scene.subtitle, { width: SUB.width, maxLines: SUB.maxLines, size: SUB.size, minSize: SUB.minSize, measure });
        return (
          <div key={scene.id} className="sheet-col" data-scene={first + i + 1}>
            <div className="sheet-label" style={{ left: u(x), top: u(LABEL_Y), fontSize: u(LABEL_SIZE) }}>
              Scene {first + i + 1}
            </div>
            <div className="sheet-note" style={{ left: u(x), top: u(NOTE.y), width: u(NOTE.width), fontSize: u(note.size) }}>
              {note.lines.map((l, k) => (
                <div key={k}>{l}</div>
              ))}
            </div>
            <Frame scene={scene} x={x} y={FRAME.y} slug={slug} scale={scale} pixelRatio={pixelRatio} interactive={interactive} it={it} />
            <div className="sheet-sub" style={{ left: u(x), top: u(SUB.y), width: u(SUB.width), fontSize: u(sub.size), lineHeight: SUB.lineHeight }}>
              {sub.lines.map((l, k) => (
                <div key={k}>{l}</div>
              ))}
            </div>
            <div className="sheet-brush" style={{ left: u(x), top: u(BRUSH.y) }}>
              <BrushLine width={BRUSH.width * scale} thickness={3.2 * scale} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** A Cover as a scene-shaped object so it can reuse SceneCanvas. */
export function coverScene(cover: Cover): Scene {
  return { id: cover.id, note: '', subtitle: '', split: false, panels: [cover.panel] };
}

/** Cover page: title + one centered frame, no labels. */
export function CoverSheet({ project, slug, scale = 1, pixelRatio, interactive = false, ...it }: SheetProps) {
  const cover = project.cover!;
  const u = (n: number) => `${n * scale}pt`;
  return (
    <section className="sheet cover" style={{ width: u(PAGE.w), height: u(PAGE.h), ...bgStyle(project.pageBackground, slug) }}>
      <div className="sheet-title" style={{ top: u(COVER.titleY), fontSize: u(COVER.titleSize) }}>
        {cover.title}
      </div>
      <Frame scene={coverScene(cover)} x={COVER.x} y={COVER.y} slug={slug} scale={scale} pixelRatio={pixelRatio} interactive={interactive} it={it} />
    </section>
  );
}

/** Static thumbnail; re-renders only when its page (or cover / project bg) object changes. */
export const SheetThumb = memo(
  function SheetThumb({ project, slug, pageIndex, scale }: { project: Project; slug: string; pageIndex: number; scale: number }) {
    return pageIndex < 0 ? (
      <CoverSheet project={project} slug={slug} scale={scale} pixelRatio={1} />
    ) : (
      <PageSheet project={project} slug={slug} pageIndex={pageIndex} scale={scale} pixelRatio={1} />
    );
  },
  (a, b) =>
    a.slug === b.slug &&
    a.scale === b.scale &&
    a.pageIndex === b.pageIndex &&
    a.project.pageBackground === b.project.pageBackground &&
    (a.pageIndex < 0
      ? a.project.cover === b.project.cover
      : a.project.pages[a.pageIndex] === b.project.pages[b.pageIndex] &&
        // scene numbers depend on earlier pages' sizes
        a.project.pages.slice(0, a.pageIndex).reduce((n, p) => n + p.scenes.length, 0) ===
          b.project.pages.slice(0, b.pageIndex).reduce((n, p) => n + p.scenes.length, 0)),
);
