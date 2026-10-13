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
  removeScene,
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
import { connectLive } from '../state/live';
import { AssetPanel, ASSET_MIME } from './AssetPanel';
import { installClipboard } from './clipboard';
import { groupLayers, moveLayers, pasteLayers, patchLayers, removeLayers, reorderLayers, ungroupLayers } from '../../shared/multi';
import { ZoomBar } from './ZoomBar';
import { undoRedoAction } from './shortcuts';
import { PropsPanel, setPropsAssetsChanged } from './PropsPanel';
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
      <button className="ib sm ghost fold" onClick={() => toggle(name)} title="Lipat panel" aria-label="Lipat panel">
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
    // connect after the project is loaded: the first `hello` then carries a version we can compare
    let stopLive = () => {};
    let alive = true;
    trackLoading(s.load(slug))
      .then(() => {
        if (alive) stopLive = connectLive(slug);
      })
      .catch((e) => setLoadError((e as Error).message));
    refreshAssets();
    return () => {
      alive = false;
      stopLive();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function refreshAssets() {
    api.listAssets(slug).then(setAssets).catch(() => undefined);
  }

  useEffect(() => installClipboard(slug, refreshAssets), [slug]);
  useEffect(() => {
    setPropsAssetsChanged(refreshAssets);
    return () => setPropsAssetsChanged(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

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
      if (st.agentActive) {
        // read-only while an agent works: allow only navigation (Esc, Z zoom, arrows to switch scene are not edits)
        if (undoRedoAction(e) || e.key === 'Delete' || e.key === 'Backspace') e.preventDefault();
        if (e.key === 'Escape' && useUi.getState().zoom) useUi.getState().setZoom(false);
        if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e)) useUi.getState().setZoom(!useUi.getState().zoom);
        return;
      }
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
      if (!panelId) return;
      const layersNow = (st.project && findPanel(st.project, panelId)?.panel.layers) || [];
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        st.setSelection(layersNow.map((l) => l.id));
        return;
      }
      const ids = st.selectedLayerIds;
      if (!ids.length) return;
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) st.apply((p) => ungroupLayers(p, panelId, ids));
        else st.apply((p) => groupLayers(p, panelId, ids).project);
        st.setSelection(ids);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        st.apply((p) => removeLayers(p, panelId, ids));
        st.selectLayer(null);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const src = layersNow.filter((l) => ids.includes(l.id));
        let added: string[] = [];
        st.apply((p) => {
          const r = pasteLayers(p, panelId, src, true);
          added = r.layerIds;
          return r.project;
        });
        st.setSelection(added);
      } else if (e.key === ']') {
        st.apply((p) => reorderLayers(p, panelId, ids, e.shiftKey ? 'top' : 'up'));
      } else if (e.key === '[') {
        st.apply((p) => reorderLayers(p, panelId, ids, e.shiftKey ? 'bottom' : 'down'));
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 50 : 5;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.apply((p) => moveLayers(p, panelId, ids, dx, dy), { coalesceKey: `nudge:${ids.join(',')}` });
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

  const locked = s.agentActive;
  const it: SheetInteraction = {
    editable: !locked,
    activeSceneId: scene.id,
    activePanelId: s.activePanelId,
    selectedLayerIds: s.selectedLayerIds,
    onSelectScene: (id) => {
      if (!onCover) s.selectScene(id);
    },
    onSelectLayer: (panelId, id, mode) => {
      if (panelId !== useEditor.getState().activePanelId) s.setActivePanel(panelId);
      const st = useEditor.getState();
      if (!id) st.selectLayer(null);
      else if (mode === 'toggle') st.toggleLayer(id);
      else if (mode === 'single') st.selectLayer(id, { single: true });
      // pressing on an already-selected layer keeps the multi-selection so it can be dragged together
      else if (!st.selectedLayerIds.includes(id)) st.selectLayer(id);
    },
    onSelectMany: (panelId, ids, additive) => {
      if (panelId !== useEditor.getState().activePanelId) s.setActivePanel(panelId);
      const st = useEditor.getState();
      st.setSelection(additive ? [...st.selectedLayerIds, ...ids] : ids);
    },
    onChangeLayers: (panelId, patches) => s.apply((p) => patchLayers(p, panelId, patches)),
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
                <button className="ib" onClick={() => sceneActions.move(-1)} disabled={locked || indexInPage === 0} title="Geser ke kiri" aria-label="Geser ke kiri">
                  <ChevronLeft size={14} aria-hidden />
                </button>
                <button className="ib" onClick={() => sceneActions.move(1)} disabled={locked || indexInPage === page!.scenes.length - 1} title="Geser ke kanan" aria-label="Geser ke kanan">
                  <ChevronRight size={14} aria-hidden />
                </button>
                <button onClick={sceneActions.add} disabled={locked || full} title={full ? 'Page sudah 3 scene — tambah page baru' : 'Tambah scene di page ini'}>
                  <Plus size={14} aria-hidden /> Scene
                </button>
                <button className="ib" onClick={sceneActions.duplicate} disabled={locked || full} title="Duplikat scene" aria-label="Duplikat scene">
                  <Copy size={14} aria-hidden />
                </button>
                <button onClick={sceneActions.remove} className="ib danger" disabled={locked || !canRemoveScene(project, scene.id)} title={canRemoveScene(project, scene.id) ? 'Hapus scene' : 'Scene terakhir di page tidak bisa dihapus — hapus page-nya'} aria-label="Hapus scene">
                  <Trash2 size={14} aria-hidden />
                </button>
              </>
            )}
            <button className={`ib${ui.zoom ? ' on' : ''}`} onClick={() => ui.setZoom(!ui.zoom)} title={ui.zoom ? 'Lihat page (Z / Esc)' : 'Zoom scene (Z)'} aria-label={ui.zoom ? 'Lihat page' : 'Zoom scene'}>
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
                    if (locked) return;
                    const rect = (e.currentTarget as HTMLElement).querySelector('.konvajs-content')!.getBoundingClientRect();
                    it.onDropAsset!(scene.id, e, rect);
                  }}
                >
                  <SceneCanvas
                    scene={scene}
                    slug={slug}
                    width={zoomW}
                    interactive={!locked}
                    activePanelId={s.activePanelId}
                    selectedLayerIds={s.selectedLayerIds}
                    onSelectLayer={it.onSelectLayer}
                    onSelectMany={it.onSelectMany}
                    onChangeLayers={it.onChangeLayers}
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
              <fieldset className="lockable" disabled={locked}>
                <PropsPanel scene={scene} number={number} pageIndex={pageIndex} assets={assets} />
              </fieldset>
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
