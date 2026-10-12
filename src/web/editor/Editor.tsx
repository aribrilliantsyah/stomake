import { useEffect, useState } from 'react';
import {
  addLayer,
  addSceneAfter,
  duplicateScene,
  findPanel,
  findScene,
  flatScenes,
  layerFromDrop,
  moveScene,
  pageIndexOfScene,
  removeLayer,
  removeScene,
  reorderLayer,
  updateLayer,
} from '../../shared/model';
import { panelSpace } from '../../shared/layout';
import type { AssetInfo, Layer } from '../../shared/types';
import { api, type AssetLists } from '../api';
import { useEditor } from '../state/editorStore';
import { AssetPanel, ASSET_MIME } from './AssetPanel';
import { PageStrip } from './PageStrip';
import { PropsPanel } from './PropsPanel';
import { SceneCanvas } from './SceneCanvas';
import { StorylinePanel } from './StorylinePanel';
import { Toolbar } from './Toolbar';

function isTyping(e: KeyboardEvent) {
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

export function Editor({ slug }: { slug: string }) {
  const s = useEditor();
  const [tab, setTab] = useState<'storyline' | 'assets'>('storyline');
  const [assets, setAssets] = useState<AssetLists>({ project: [], global: [] });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stageBox, box] = useSize();

  useEffect(() => {
    s.load(slug).catch((e) => setLoadError((e as Error).message));
    refreshAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function refreshAssets() {
    api.listAssets(slug).then(setAssets).catch(() => undefined);
  }

  // flush pending save on tab close
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      const st = useEditor.getState().saveStatus;
      if (st === 'dirty' || st === 'saving' || st === 'error') {
        useEditor.getState().flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);

  const project = s.project;
  const scene = project && s.currentSceneId ? findScene(project, s.currentSceneId) : null;

  // keyboard shortcuts
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
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

  if (loadError) return <div className="error pad">Gagal membuka project: {loadError}</div>;
  if (!project || !scene) return <div className="pad muted">Memuat…</div>;

  const flat = flatScenes(project);
  const number = flat.find((f) => f.scene.id === scene.id)!.number;
  const pageIndex = pageIndexOfScene(project, scene.id);

  // canvas size: fit 9:16 into the center box
  const maxH = Math.max(200, box.h - 16);
  const canvasW = Math.max(120, Math.min(box.w - 16, (maxH * 9) / 16));
  const canvasH = (canvasW * 16) / 9;

  const sceneActions = {
    add: () => {
      let next = '';
      s.apply((p) => {
        const r = addSceneAfter(p, scene.id);
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
      if (next) s.selectScene(next);
    },
    remove: () => {
      const idx = flat.findIndex((f) => f.scene.id === scene.id);
      const neighbour = flat[idx + 1]?.scene.id ?? flat[idx - 1]?.scene.id;
      if (flat.length > 1 && (scene.panels.some((p) => p.layers.length) || scene.subtitle || scene.note)) {
        if (!confirm(`Hapus Scene ${number}?`)) return;
      }
      s.apply((p) => removeScene(p, scene.id));
      if (neighbour) s.selectScene(neighbour);
    },
    move: (dir: -1 | 1) => s.apply((p) => moveScene(p, scene.id, dir)),
  };

  function onDrop(e: React.DragEvent) {
    const raw = e.dataTransfer.getData(ASSET_MIME);
    if (!raw || !scene) return;
    e.preventDefault();
    const info = JSON.parse(raw) as AssetInfo;
    const rect = (e.currentTarget as HTMLElement).querySelector('.konvajs-content')!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;
    const scale = rect.width / 1080;
    const idx = scene.split && py > rect.height / 2 ? 1 : 0;
    const panel = scene.panels[idx];
    const space = panelSpace(scene.split);
    const x = Math.round(px / scale);
    const y = Math.round((py - (idx * rect.height) / 2) / scale);
    const layer = layerFromDrop(info, x, Math.min(space.h, y), space);
    s.apply((p) => addLayer(p, panel.id, layer));
    s.setActivePanel(panel.id);
    s.selectLayer(layer.id);
  }

  return (
    <div className="editor">
      <Toolbar slug={slug} />
      <div className="editor-body">
        <aside className="side left">
          <div className="tabs">
            <button className={tab === 'storyline' ? 'on' : ''} onClick={() => setTab('storyline')}>
              Storyline
            </button>
            <button className={tab === 'assets' ? 'on' : ''} onClick={() => setTab('assets')}>
              Asset
            </button>
          </div>
          <div className="tab-body" hidden={tab !== 'storyline'}>
            <StorylinePanel slug={slug} />
          </div>
          <div className="tab-body" hidden={tab !== 'assets'}>
            <AssetPanel slug={slug} assets={assets} onUploaded={refreshAssets} />
          </div>
        </aside>

        <main className="center">
          <PageStrip project={project} currentSceneId={scene.id} onSelect={s.selectScene} />
          <div className="scene-head">
            <span className="scene-title">Scene {number}</span>
            <span className="muted mono">
              dari {flat.length} · Page {pageIndex + 1}/{project.pages.length} ({project.pages[pageIndex].scenes.length} scene)
            </span>
            <div className="grow" />
            <button onClick={() => sceneActions.move(-1)} disabled={number === 1} title="Pindah ke kiri">
              ←
            </button>
            <button onClick={() => sceneActions.move(1)} disabled={number === flat.length} title="Pindah ke kanan">
              →
            </button>
            <button onClick={sceneActions.add}>+ Scene</button>
            <button onClick={sceneActions.duplicate}>Duplikat</button>
            <button onClick={sceneActions.remove} className="danger">
              Hapus
            </button>
          </div>
          <div className="stage-box" ref={stageBox}>
            <div
              className="stage-frame"
              style={{ width: canvasW, height: canvasH }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(ASSET_MIME)) e.preventDefault();
              }}
              onDrop={onDrop}
            >
              {box.w > 0 && (
                <SceneCanvas
                  scene={scene}
                  slug={slug}
                  width={canvasW}
                  interactive
                  activePanelId={s.activePanelId}
                  selectedLayerId={s.selectedLayerId}
                  onSelectLayer={(panelId, id) => {
                    if (panelId !== s.activePanelId) s.setActivePanel(panelId);
                    s.selectLayer(id);
                  }}
                  onChangeLayer={(panelId, layerId, patch) => s.apply((p) => updateLayer(p, panelId, layerId, patch))}
                />
              )}
            </div>
          </div>
        </main>

        <aside className="side right">
          <PropsPanel scene={scene} number={number} pageIndex={pageIndex} assets={assets} />
        </aside>
      </div>
    </div>
  );
}
