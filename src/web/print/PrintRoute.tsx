import Konva from 'konva';
import { useEffect, useState } from 'react';
import { loadFonts, loadedFonts } from '../fonts';
import type { Project } from '../../shared/types';
import { api } from '../api';
import { assetUrl, loadImage, missingRefs, pendingImages } from '../state/imageCache';
import { PageSheet } from './PageSheet';

function allRefs(p: Project): string[] {
  const refs = new Set<string>();
  const addBg = (b: Project['pageBackground'] | null) => b?.kind === 'asset' && refs.add(b.ref);
  addBg(p.pageBackground);
  for (const pg of p.pages) {
    addBg(pg.background);
    for (const sc of pg.scenes)
      for (const pn of sc.panels) {
        addBg(pn.background);
        for (const l of pn.layers) if (l.type === 'image') refs.add(l.ref);
      }
  }
  return [...refs];
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

export function PrintRoute({ slug, page }: { slug: string; page: number | null }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('print-mode');
    Konva.pixelRatio = 4; // frame bitmaps at 4x for a sharp PDF
    window.__PRINT_READY__ = false;
    api.getProject(slug).then(setProject, (e) => {
      setError(e.message);
      window.__PRINT_ERROR__ = e.message;
    });
    return () => document.body.classList.remove('print-mode');
  }, [slug]);

  useEffect(() => {
    if (!project) return;
    let alive = true;
    (async () => {
      const refs = allRefs(project);
      const results = await Promise.all(refs.map((r) => loadImage(assetUrl(r as never, slug))));
      refs.forEach((r, i) => !results[i] && missingRefs.add(r));
      await loadFonts();
      // let Konva redraw with loaded images
      for (let i = 0; i < 10 && pendingImages() > 0; i++) await new Promise((r) => setTimeout(r, 50));
      await nextFrame();
      await nextFrame();
      await new Promise((r) => setTimeout(r, 150));
      if (!alive) return;
      window.__MISSING_ASSETS__ = [...missingRefs].sort();
      window.__FONTS__ = loadedFonts();
      window.__PRINT_READY__ = true;
    })();
    return () => {
      alive = false;
    };
  }, [project, slug]);

  if (error) return <div className="error pad">{error}</div>;
  if (!project) return null;
  const indices = page === null || !(page >= 0 && page < project.pages.length) ? project.pages.map((_, i) => i) : [page];
  return (
    <div className="print-root">
      {indices.map((i) => (
        <PageSheet key={project.pages[i].id} project={project} pageIndex={i} slug={slug} />
      ))}
    </div>
  );
}
