import { useState } from 'react';
import { addCover, addPage, duplicatePage, movePage, removeCover, removePage } from '../../shared/model';
import type { Project } from '../../shared/types';
import { SheetThumb } from '../print/PageSheet';
import { Popover } from '../ui/Popover';
import { useEditor } from '../state/editorStore';

/** 708.75pt page (945px) into the 132px thumbnail box: 132 / 945 */
const THUMB_SCALE = 0.139;

function sceneRange(p: Project, pi: number): string {
  const first = p.pages.slice(0, pi).reduce((n, pg) => n + pg.scenes.length, 0) + 1;
  const last = first + p.pages[pi].scenes.length - 1;
  return first === last ? `${first}` : `${first}–${last}`;
}

export function SlidesPanel({ slug }: { slug: string }) {
  const s = useEditor();
  const project = s.project!;
  const current = s.currentPageIndex();
  const [menu, setMenu] = useState<{ pi: number; el: HTMLElement } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const selectPage = (pi: number) => s.selectScene(project.pages[pi].scenes[0].id);

  function addPageAfterCurrent() {
    let target = '';
    s.apply((p) => {
      const after = current >= 0 ? p.pages[current]?.id ?? null : null;
      const r = addPage(p, after);
      target = r.sceneId;
      return r.project;
    });
    if (target) s.selectScene(target);
  }

  function pageHasContent(pi: number) {
    return project.pages[pi].scenes.some((sc) => sc.note || sc.subtitle || sc.panels.some((pn) => pn.layers.length));
  }

  function act(pi: number, what: 'dup' | 'del' | 'up' | 'down') {
    const id = project.pages[pi].id;
    setMenu(null);
    if (what === 'dup') {
      let nid = '';
      s.apply((p) => {
        const r = duplicatePage(p, id);
        nid = r.pageId;
        return r.project;
      });
      const pg = useEditor.getState().project!.pages.find((x) => x.id === nid);
      if (pg) s.selectScene(pg.scenes[0].id);
    } else if (what === 'del') {
      if (project.pages.length <= 1) return;
      if (pageHasContent(pi) && !confirm(`Hapus Page ${pi + 1} beserta ${project.pages[pi].scenes.length} scene?`)) return;
      s.apply((p) => removePage(p, id));
    } else s.apply((p) => movePage(p, id, what === 'up' ? -1 : 1));
  }

  function drop(to: number) {
    if (dragFrom === null || dragFrom === to) return;
    const id = project.pages[dragFrom].id;
    const dir = to > dragFrom ? 1 : -1;
    s.apply((p) => {
      let q = p;
      for (let i = 0; i < Math.abs(to - dragFrom); i++) q = movePage(q, id, dir);
      return q;
    });
  }

  return (
    <div className="slides">
      <div className="slides-list">
        {project.cover && (
          <div className={`slide ${s.selectedCover ? 'on' : ''}`} onClick={() => s.selectCover()}>
            <div className="slide-thumb">
              <SheetThumb project={project} slug={slug} pageIndex={-1} scale={THUMB_SCALE} />
            </div>
            <div className="slide-meta">
              <span>Cover</span>
              <button
                className="slide-more"
                title="Hapus cover"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Hapus cover?')) s.apply((p) => removeCover(p));
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}
        {project.pages.map((pg, pi) => (
          <div
            key={pg.id}
            className={`slide ${current === pi ? 'on' : ''} ${dragOver === pi ? 'drag-over' : ''}`}
            draggable
            onDragStart={(e) => {
              setDragFrom(pi);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('application/x-storyboard-slide', String(pi));
            }}
            onDragOver={(e) => {
              if (dragFrom !== null) {
                e.preventDefault();
                setDragOver(pi);
              }
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              drop(pi);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            onClick={() => selectPage(pi)}
            onContextMenu={(e) => {
              e.preventDefault();
              const btn = (e.currentTarget as HTMLElement).querySelector('.slide-more') as HTMLElement;
              setMenu({ pi, el: btn });
            }}
          >
            <div className="slide-thumb">
              <SheetThumb project={project} slug={slug} pageIndex={pi} scale={THUMB_SCALE} />
            </div>
            <div className="slide-meta">
              <span className="mono">P{pi + 1}</span>
              <span className="muted mono">{sceneRange(project, pi)}</span>
              <button
                className="slide-more"
                title="Menu page"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu(menu?.pi === pi ? null : { pi, el: e.currentTarget });
                }}
              >
                ⋯
              </button>
            </div>
            {menu?.pi === pi && (
              <Popover anchor={menu.el} open onClose={() => setMenu(null)} width={160} height={200} className="menu-list">
                <button onClick={() => act(pi, 'dup')}>Duplikat page</button>
                <button onClick={() => act(pi, 'up')} disabled={pi === 0}>
                  Naik
                </button>
                <button onClick={() => act(pi, 'down')} disabled={pi === project.pages.length - 1}>
                  Turun
                </button>
                <button className="danger" onClick={() => act(pi, 'del')} disabled={project.pages.length <= 1}>
                  Hapus page
                </button>
              </Popover>
            )}
          </div>
        ))}
      </div>
      <div className="slides-actions">
        <button onClick={addPageAfterCurrent}>+ Page</button>
        {!project.cover && (
          <button
            onClick={() => {
              s.apply((p) => addCover(p));
              s.selectCover();
            }}
          >
            + Cover
          </button>
        )}
      </div>
    </div>
  );
}
