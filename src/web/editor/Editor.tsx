import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Images, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Plus, ScrollText, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  addLayer,
  addSceneInPage,
  canRemoveScene,
  duplicateScene,
  findPanel,
  flatScenes,
  layerFromDrop,
  moveScene,
  pageOf,
  removeLayer,
  removeScene,
  reorderLayer,
  updateLayer,
} from '../../shared/model';
import { FRAME, PAGE, panelSpace } from '../../shared/layout';
import type { AssetInfo, Layer, Scene } from '../../shared/types';
import { api, type AssetLists } from '../api';
import { CoverSheet, coverScene, PageSheet, PT_TO_PX, type SheetInteraction } from '../print/PageSheet';
import { useEditor } from '../state/editorStore';
import { nextZoom, useUi, type PanelName } from '../state/uiStore';
import { Toasts } from '../ui/Toasts';
import { navigate } from '../router';
import { EditorSkeleton } from '../ui/Loading';
import { trackLoading } from '../state/progress';
import { AssetPanel, ASSET_MIME } from './AssetPanel';
import { installClipboard } from './clipboard';
import { ZoomBar } from './ZoomBar';
import { undoRedoAction } from './shortcuts';
import { PropsPanel } from './PropsPanel';
import { SceneCanvas } from './SceneCanvas';
import { SlidesPanel } from './SlidesPanel';
import { StorylinePanel } from './StorylinePanel';
import { Toolbar } from './Toolbar';

export function isTyping(e: Event) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

/** Callback-ref based so it works when the element mounts after the first render. */
function useSize(): [(el: HTMLElement | null) => void, { w: number; h: number }] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

/** Map a drop on a scene canvas to a new image layer in the right panel. */
function dropToLayer(scene: Scene, e: React.DragEvent, rect: DOMRect): { panelId: string; layer: Layer } | null {
  const raw = e.dataTransfer.getData(ASSET_MIME);
  if (!raw) return null;
  e.preventDefault();
  const info = JSON.parse(raw) as AssetInfo;
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null;
  const scale = rect.width / 1080;
  const idx = scene.split && py > rect.height / 2 ? 1 : 0;
  const space = panelSpace(scene.split);
  const x = Math.round(px / scale);
  const y = Math.round((py - (idx * rect.height) / 2) / scale);
  return { panelId: scene.panels[idx].id, layer: layerFromDrop(info, x, Math.min(space.h, y), space) };
}

const PANEL_KEYS: Record<string, PanelName> = { '1': 'slides', '2': 'library', '3': 'props' };

function Collapsed({ name, label }: { name: PanelName; label: string }) {
  const toggle = useUi((u) => u.togglePanel);
  return (
    <button className="collapsed" onClick={() => toggle(name)} title={`Buka ${label}`}>
      <PanelLeftOpen size={14} aria-hidden />
      <span className="collapsed-label">{label}</span>
    </button>
  );
}

function PanelHead({ name, children }: { name: PanelName; children?: React.ReactNode }) {
  const toggle = useUi((u) => u.togglePanel);
  return (
    <div className="panel-head">
      {children}
      <div className="grow" />
      <button className="fold" onClick={() => toggle(name)} title="Lipat panel" aria-label="Lipat panel">
        <PanelLeftClose size={14} aria-hidden />
      </button>
    </div>
  );
}

const fitPctRef = { current: 100 };

export function Editor({ slug }: { slug: string }) {
  const s = useEditor();
  const ui = useUi();
  const [tab, setTab] = useState<'storyline' | 'assets'>('storyline');
  const [assets, setAssets] = useState<AssetLists>({ project: [], global: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stageBox, box] = useSize();

  useEffect(() => {
    trackLoading(s.load(slug)).catch((e) => setLoadError((e as Error).message));
    refreshAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function refreshAssets() {
    api.listAssets(slug).then(setAssets).catch(() => undefined);
  }

  useEffect(() => installClipboard(slug, refreshAssets), [slug]);

  // flush pending save on tab close / unmount
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      const st = useEditor.getState().saveStatus;
      if (st === 'dirty' || st === 'saving' || st === 'error') {
        useEditor.getState().flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', before);
    return () => {
      window.removeEventListener('beforeunload', before);
      useEditor.getState().flush().catch(() => undefined);
    };
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
        e.preventDefault();
        const u = useUi.getState();
        if (e.key === '0') u.setPageZoom('fit');
        else u.setPageZoom(nextZoom(u.pageZoom === 'fit' ? fitPctRef.current : u.pageZoom, e.key === '-' ? -1 : 1));
        return;
      }
      if (mod && PANEL_KEYS[e.key]) {
        e.preventDefault();
        useUi.getState().togglePanel(PANEL_KEYS[e.key]);
        return;
      }
      const st = useEditor.getState();
      const ur = undoRedoAction(e);
      if (ur) {
        e.preventDefault();
        if (ur === 'undo') st.undo();
        else st.redo();
        return;
      }
      if (isTyping(e)) return;
      if (e.key === 'Escape' && useUi.getState().zoom && !st.selectedLayerId) {
        useUi.getState().setZoom(false);
        return;
      }
      if (!mod && e.key.toLowerCase() === 'z') {
        useUi.getState().setZoom(!useUi.getState().zoom);
        return;
      }
      const panelId = st.activePanelId;
      const layerId = st.selectedLayerId;
      if (!panelId || !layerId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        st.apply((p) => removeLayer(p, panelId, layerId));
        st.selectLayer(null);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const found = st.project && findPanel(st.project, panelId);
        const src = found?.panel.layers.find((l) => l.id === layerId);
        if (!src) return;
        const copy = { ...structuredClone(src), id: crypto.randomUUID(), x: src.x + 40, y: src.y + 40 } as Layer;
        st.apply((p) => addLayer(p, panelId, copy));
        st.selectLayer(copy.id);
      } else if (e.key === ']') {
        st.apply((p) => reorderLayer(p, panelId, layerId, e.shiftKey ? 'top' : 'up'));
      } else if (e.key === '[') {
        st.apply((p) => reorderLayer(p, panelId, layerId, e.shiftKey ? 'bottom' : 'down'));
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 50 : 5;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const found = st.project && findPanel(st.project, panelId);
        const l = found?.panel.layers.find((x) => x.id === layerId);
        if (l) st.apply((p) => updateLayer(p, panelId, layerId, { x: l.x + dx, y: l.y + dy }), { coalesceKey: `nudge:${layerId}` });
      } else if (e.key === 'Escape') {
        st.selectLayer(null);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const project = s.project;
  if (loadError)
    return (
      <div className="load-fail">
        <div className="load-fail-box">
          <b>Gagal membuka project</b>
          <p className="mono">{loadError}</p>
          <div className="row">
            <button onClick={() => navigate('/')}><ArrowLeft size={14} aria-hidden /> Kembali ke daftar project</button>
            <button className="primary" onClick={() => location.reload()}>
              Coba lagi
            </button>
          </div>
        </div>
      </div>
    );
  if (!project || !s.currentSceneId || s.slug !== slug) return <EditorSkeleton />;

  const onCover = s.selectedCover && !!project.cover;
  const scene: Scene = onCover ? coverScene(project.cover!) : flatScenes(project).find((f) => f.scene.id === s.currentSceneId)!.scene;
  const pageIndex = s.currentPageIndex();
  const page = onCover ? null : project.pages[pageIndex];
  const flat = flatScenes(project);
  const number = onCover ? 0 : flat.find((f) => f.scene.id === scene.id)!.number;
  const indexInPage = page ? page.scenes.findIndex((x) => x.id === scene.id) : 0;

  const it: SheetInteraction = {
    activeSceneId: scene.id,
    activePanelId: s.activePanelId,
    selectedLayerId: s.selectedLayerId,
    onSelectScene: (id) => {
      if (!onCover) s.selectScene(id);
    },
    onSelectLayer: (panelId, id) => {
      if (panelId !== useEditor.getState().activePanelId) s.setActivePanel(panelId);
      s.selectLayer(id);
    },
    onChangeLayer: (panelId, layerId, patch) => s.apply((p) => updateLayer(p, panelId, layerId, patch)),
    onDropAsset: (sceneId, e, rect) => {
      const target = sceneId === project.cover?.id ? coverScene(project.cover) : flat.find((f) => f.scene.id === sceneId)?.scene;
      if (!target) return;
      const r = dropToLayer(target, e, rect);
      if (!r) return;
      if (target.id !== scene.id && !onCover) s.selectScene(target.id);
      s.apply((p) => addLayer(p, r.panelId, r.layer));
      s.setActivePanel(r.panelId);
      s.selectLayer(r.layer.id);
    },
    onOpenScene: () => ui.setZoom(true),
  };

  const sceneActions = {
    add: () => {
      if (!page) return;
      let next = '';
      s.apply((p) => {
        const r = addSceneInPage(p, page.id, scene.id);
        if (!r) return p;
        next = r.sceneId;
        return r.project;
      });
      if (next) s.selectScene(next);
    },
    duplicate: () => {
      let next = '';
      s.apply((p) => {
        const r = duplicateScene(p, scene.id);
        next = r.sceneId;
        return r.project;
      });
      if (next && next !== scene.id) s.selectScene(next);
    },
    remove: () => {
      if (scene.panels.some((p) => p.layers.length) || scene.subtitle || scene.note) {
        if (!confirm(`Hapus Scene ${number}?`)) return;
      }
      s.apply((p) => removeScene(p, scene.id));
    },
    move: (dir: -1 | 1) => s.apply((p) => moveScene(p, scene.id, dir)),
  };

  // fit page (or zoomed scene) into the center box; pageZoom % is relative to real size (scale 1)
  const fitScale = Math.max(0.25, Math.min((box.w - 24) / (PAGE.w * PT_TO_PX), (box.h - 24) / (PAGE.h * PT_TO_PX)));
  fitPctRef.current = Math.round(fitScale * 100);
  const pageScale = ui.pageZoom === 'fit' ? fitScale : ui.pageZoom / 100;
  const zoomW = Math.max(120, Math.min(box.w - 24, ((box.h - 24) * 9) / 16));
  const full = page !== null && page.scenes.length >= 3;

  const cols = [
    ui.panels.slides ? '168px' : '28px',
    ui.panels.library ? '280px' : '28px',
    'minmax(0, 1fr)',
    ui.panels.props ? '300px' : '28px',
  ].join(' ');

  return (
    <div className="editor">
      <Toolbar slug={slug} />
      <div className="editor-body" style={{ gridTemplateColumns: cols }}>
        <aside className="side slides-col">
          {ui.panels.slides ? (
            <>
              <PanelHead name="slides">
                <span className="panel-title">Slides</span>
              </PanelHead>
              <SlidesPanel slug={slug} />
            </>
          ) : (
            <Collapsed name="slides" label="Slides" />
          )}
        </aside>

        <aside className="side left">
          {ui.panels.library ? (
            <>
              <PanelHead name="library">
                <div className="tabs">
                  <button className={tab === 'storyline' ? 'on' : ''} onClick={() => setTab('storyline')}>
                    <ScrollText size={14} aria-hidden /> Storyline
                  </button>
                  <button className={tab === 'assets' ? 'on' : ''} onClick={() => setTab('assets')}>
                    <Images size={14} aria-hidden /> Asset
                  </button>
                </div>
              </PanelHead>
              <div className="tab-body" hidden={tab !== 'storyline'}>
                <StorylinePanel slug={slug} />
              </div>
              <div className="tab-body" hidden={tab !== 'assets'}>
                <AssetPanel slug={slug} assets={assets} onUploaded={refreshAssets} />
              </div>
            </>
          ) : (
            <Collapsed name="library" label="Storyline / Asset" />
          )}
        </aside>

        <main className="center">
          <div className="scene-head">
            {onCover ? (
              <span className="scene-title">Cover</span>
            ) : (
              <>
                <span className="scene-title">Scene {number}</span>
                <span className="muted mono">
                  Page {pageIndex + 1}/{project.pages.length} · {page!.scenes.length}/3 scene
                </span>
              </>
            )}
            <div className="grow" />
            {!onCover && (
              <>
                <button onClick={() => sceneActions.move(-1)} disabled={indexInPage === 0} title="Geser ke kiri" aria-label="Geser ke kiri">
                  <ChevronLeft size={14} aria-hidden />
                </button>
                <button onClick={() => sceneActions.move(1)} disabled={indexInPage === page!.scenes.length - 1} title="Geser ke kanan" aria-label="Geser ke kanan">
                  <ChevronRight size={14} aria-hidden />
                </button>
                <button onClick={sceneActions.add} disabled={full} title={full ? 'Page sudah 3 scene — tambah page baru' : 'Tambah scene di page ini'}>
                  <Plus size={14} aria-hidden /> Scene
                </button>
                <button onClick={sceneActions.duplicate} disabled={full} title="Duplikat scene" aria-label="Duplikat scene">
                  <Copy size={14} aria-hidden />
                </button>
                <button onClick={sceneActions.remove} className="danger" disabled={!canRemoveScene(project, scene.id)} title={canRemoveScene(project, scene.id) ? 'Hapus scene' : 'Scene terakhir di page tidak bisa dihapus — hapus page-nya'} aria-label="Hapus scene">
                  <Trash2 size={14} aria-hidden />
                </button>
              </>
            )}
            <button className={ui.zoom ? 'on' : ''} onClick={() => ui.setZoom(!ui.zoom)} title={ui.zoom ? 'Lihat page (Z / Esc)' : 'Zoom scene (Z)'} aria-label={ui.zoom ? 'Lihat page' : 'Zoom scene'}>
              {ui.zoom ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
            </button>
          </div>
          <div
            className={`stage-box${!ui.zoom && ui.pageZoom !== 'fit' ? ' scroll' : ''}`}
            ref={stageBox}
            onWheel={(e) => {
              if (!(e.ctrlKey || e.metaKey) || ui.zoom) return;
              e.preventDefault();
              ui.setPageZoom(nextZoom(ui.pageZoom === 'fit' ? fitPctRef.current : ui.pageZoom, e.deltaY < 0 ? 1 : -1));
            }}
          >
            {box.w > 0 &&
              (ui.zoom ? (
                <div
                  className="stage-frame"
                  style={{ width: zoomW, height: (zoomW * 16) / 9 }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(ASSET_MIME)) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    const rect = (e.currentTarget as HTMLElement).querySelector('.konvajs-content')!.getBoundingClientRect();
                    it.onDropAsset!(scene.id, e, rect);
                  }}
                >
                  <SceneCanvas
                    scene={scene}
                    slug={slug}
                    width={zoomW}
                    interactive
                    activePanelId={s.activePanelId}
                    selectedLayerId={s.selectedLayerId}
                    onSelectLayer={it.onSelectLayer}
                    onChangeLayer={it.onChangeLayer}
                  />
                </div>
              ) : onCover ? (
                <CoverSheet project={project} slug={slug} scale={pageScale} interactive {...it} />
              ) : (
                <PageSheet project={project} slug={slug} pageIndex={pageIndex} scale={pageScale} interactive {...it} />
              ))}
          </div>
          {!ui.zoom && (
            <ZoomBar
              fitPercent={fitPctRef.current}
              info={onCover ? 'Cover' : `Page ${pageIndex + 1} dari ${project.pages.length} · ${flat.length} scene`}
            />
          )}
        </main>

        <aside className="side right">
          {ui.panels.props ? (
            <>
              <PanelHead name="props">
                <span className="panel-title">Properti</span>
              </PanelHead>
              <PropsPanel scene={scene} number={number} pageIndex={pageIndex} assets={assets} />
            </>
          ) : (
            <Collapsed name="props" label="Properti" />
          )}
        </aside>
      </div>
      <Toasts />
    </div>
  );
}

export { FRAME };
