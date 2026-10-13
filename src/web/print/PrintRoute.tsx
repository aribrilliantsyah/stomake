import Konva from 'konva';
import { useEffect, useState } from 'react';
import type { Background, Panel, Project } from '../../shared/types';
import { api } from '../api';
import { loadFont, loadFonts, loadedFonts } from '../fonts';
import { assetUrl, loadImage, missingRefs, pendingImages } from '../state/imageCache';
import { CoverSheet, PageSheet } from './PageSheet';

function allPanels(p: Project): Panel[] {
  const out: Panel[] = p.cover ? [p.cover.panel] : [];
  for (const pg of p.pages) for (const sc of pg.scenes) out.push(...sc.panels);
  return out;
}

function allRefs(p: Project): string[] {
  const refs = new Set<string>();
  const addBg = (b: Background | null) => b?.kind === 'asset' && refs.add(b.ref);
  addBg(p.pageBackground);
  for (const pg of p.pages) addBg(pg.background);
  for (const pn of allPanels(p)) {
    addBg(pn.background);
    for (const l of pn.layers) if (l.type === 'image') refs.add(l.ref);
  }
  return [...refs];
}

export function usedFonts(p: Project): string[] {
  const fonts = new Set<string>();
  for (const pn of allPanels(p)) for (const l of pn.layers) if (l.type === 'text') fonts.add(l.font);
  return [...fonts].sort();
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/**
 * page: null = whole document (cover first), -1 = cover only, N = page N only.
 */
export function PrintRoute({ slug, page }: { slug: string; page: number | null }) {
  const [project, setProject] = useState<Project | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
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

  // fonts first, so text offsets are measured with the real font on first draw
  useEffect(() => {
    if (!project) return;
    let alive = true;
    (async () => {
      await loadFonts();
      const missing: string[] = [];
      for (const f of usedFonts(project)) if (!(await loadFont(f))) missing.push(f);
      window.__MISSING_FONTS__ = missing;
      if (alive) setFontsReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [project]);

  useEffect(() => {
    if (!project || !fontsReady) return;
    let alive = true;
    (async () => {
      const refs = allRefs(project);
      const results = await Promise.all(refs.map((r) => loadImage(assetUrl(r as never, slug))));
      refs.forEach((r, i) => !results[i] && missingRefs.add(r));
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
  }, [project, fontsReady, slug]);

  if (error) return <div className="error pad">{error}</div>;
  if (!project || !fontsReady) return null;
  const showCover = !!project.cover && (page === null || page === -1);
  const indices =
    page === -1 && project.cover ? [] : page === null || !(page >= 0 && page < project.pages.length) ? project.pages.map((_, i) => i) : [page];
  return (
    <div className="print-root">
      {showCover && <CoverSheet project={project} slug={slug} />}
      {indices.map((i) => (
        <PageSheet key={project.pages[i].id} project={project} pageIndex={i} slug={slug} />
      ))}
    </div>
  );
}
