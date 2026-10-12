import { BRUSH, columnXs, FRAME, LABEL_SIZE, LABEL_Y, NOTE, PAGE, SUB, TITLE, fitText } from '../../shared/layout';
import type { Background, Project } from '../../shared/types';
import { SceneCanvas } from '../editor/SceneCanvas';
import { assetUrl } from '../state/imageCache';
import { BrushFrame, BrushLine } from './BrushLine';

const PT_TO_PX = 96 / 72;
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

const pt = (n: number) => `${n}pt`;

/** One storyboard page at real print size (708.75pt x 567pt). */
export function PageSheet({ project, pageIndex, slug, pixelRatio = 4 }: { project: Project; pageIndex: number; slug: string; pixelRatio?: number }) {
  const page = project.pages[pageIndex];
  const first = project.pages.slice(0, pageIndex).reduce((n, p) => n + p.scenes.length, 0);
  const xs = columnXs(page.scenes.length);
  const bg = page.background ?? project.pageBackground;

  return (
    <section className="sheet" style={{ width: pt(PAGE.w), height: pt(PAGE.h), ...bgStyle(bg, slug) }}>
      <div className="sheet-title" style={{ top: pt(TITLE.y), fontSize: pt(TITLE.size) }}>
        {TITLE.text}
      </div>
      {page.scenes.map((scene, i) => {
        const x = xs[i];
        const note = scene.note.trim() ? fitText(scene.note, { width: NOTE.width, maxLines: NOTE.maxLines, size: NOTE.size, minSize: 5, measure }) : { size: NOTE.size, lines: ['-'] };
        const sub = fitText(scene.subtitle, { width: SUB.width, maxLines: SUB.maxLines, size: SUB.size, minSize: SUB.minSize, measure });
        return (
          <div key={scene.id} className="sheet-col" data-scene={first + i + 1}>
            <div className="sheet-label" style={{ left: pt(x), top: pt(LABEL_Y), fontSize: pt(LABEL_SIZE) }}>
              Scene {first + i + 1}
            </div>
            <div className="sheet-note" style={{ left: pt(x), top: pt(NOTE.y), width: pt(NOTE.width), fontSize: pt(note.size) }}>
              {note.lines.map((l, k) => (
                <div key={k}>{l}</div>
              ))}
            </div>
            <div className="sheet-frame" style={{ left: pt(x), top: pt(FRAME.y), width: pt(FRAME.w), height: pt(FRAME.h) }}>
              <SceneCanvas scene={scene} slug={slug} width={FRAME.w * PT_TO_PX} interactive={false} pixelRatio={pixelRatio} />
              <BrushFrame w={FRAME.w} h={FRAME.h} />
            </div>
            <div className="sheet-sub" style={{ left: pt(x), top: pt(SUB.y), width: pt(SUB.width), fontSize: pt(sub.size), lineHeight: SUB.lineHeight }}>
              {sub.lines.map((l, k) => (
                <div key={k}>{l}</div>
              ))}
            </div>
            <div className="sheet-brush" style={{ left: pt(x), top: pt(BRUSH.y) }}>
              <BrushLine width={BRUSH.width} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
