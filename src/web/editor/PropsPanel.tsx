import { ImagePlus, Loader2, BringToFront, ChevronDown, ChevronUp, FlipHorizontal2, FlipVertical2, SendToBack, Trash2 } from 'lucide-react';
import { replaceRef, removeLayer, reorderLayer, setLayerOpacity, setPageBackground, setSplit, updateCover, updateLayer, updatePanel, updateScene } from '../../shared/model';
import type { Background, Layer, Scene } from '../../shared/types';
import { AssetPicker } from './AssetPicker';
import { FontPicker } from './FontPicker';
import { api, type AssetLists } from '../api';
import { toast } from '../state/uiStore';
import { useState } from 'react';
import { ColorField } from '../ui/ColorField';
import { useEditor } from '../state/editorStore';

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="fld">
      <span>{label}</span>
      <input
        type="number"
        className="mono"
        step={step}
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

function BgEditor({ label, bg, onChange, allowInherit, assets }: { label: string; bg: Background | null; onChange: (b: Background | null) => void; allowInherit?: boolean; assets: AssetLists }) {
  const all = [...assets.project, ...assets.global];
  const kind = bg === null ? 'inherit' : bg.kind;
  return (
    <div className="bg-editor">
      <label className="fld">
        <span>{label}</span>
        <select
          value={kind}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'inherit') onChange(null);
            else if (v === 'color') onChange({ kind: 'color', color: bg?.kind === 'color' ? bg.color : '#FFFFFF' });
            else if (all[0]) onChange({ kind: 'asset', ref: all[0].ref, fit: 'cover' });
          }}
        >
          {allowInherit && <option value="inherit">Ikut default project</option>}
          <option value="color">Warna</option>
          <option value="asset" disabled={!all.length}>
            Gambar asset
          </option>
        </select>
      </label>
      {bg?.kind === 'color' && <ColorField label={label} value={bg.color} onChange={(color) => onChange({ kind: 'color', color })} />}
      {bg?.kind === 'asset' && (
        <div className="fld-row">
          <AssetPicker value={bg.ref} assets={assets} onChange={(ref) => onChange({ ...bg, ref })} />
          <select className="fit-select" value={bg.fit} onChange={(e) => onChange({ ...bg, fit: e.target.value as 'cover' | 'contain' })} aria-label="Penyesuaian">
            <option value="cover">Penuhi</option>
            <option value="contain">Muat</option>
          </select>
        </div>
      )}
    </div>
  );
}

/** A pasted image lives only in this scene; offer to add it to the project's asset library. */
function SaveClip({ layer, panelId }: { layer: Extract<Layer, { type: 'image' }>; panelId: string }) {
  const [busy, setBusy] = useState(false);
  const slug = useEditor((s) => s.slug);
  const apply = useEditor((s) => s.apply);
  const name = layer.ref.slice('clip:'.length);
  return (
    <div className="clip-note">
      <span className="muted small">Gambar tempelan — belum ada di Asset.</span>
      <button
        disabled={busy || !slug}
        onClick={async () => {
          setBusy(true);
          try {
            const info = await api.promoteClip(slug!, name);
            // every layer using this clip now points at the library copy
            apply((p) => replaceRef(p, layer.ref, info.ref));
            onAssetsChanged?.();
            toast('ok', `Disimpan ke Asset: ${info.name}`);
          } catch (e) {
            toast('err', `Gagal menyimpan: ${(e as Error).message}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 size={14} className="spin" aria-hidden /> : <ImagePlus size={14} aria-hidden />} Simpan ke asset
      </button>
    </div>
  );
}

let onAssetsChanged: (() => void) | null = null;
export function setPropsAssetsChanged(fn: (() => void) | null) {
  onAssetsChanged = fn;
}

function LayerProps({ layer, panelId }: { layer: Layer; panelId: string }) {
  const apply = useEditor((s) => s.apply);
  const set = (patch: Partial<Layer>, key = 'f') => apply((p) => updateLayer(p, panelId, layer.id, patch), { coalesceKey: `${key}:${layer.id}` });
  return (
    <div className="layer-props">
      <div className="grid3">
        <Num label="X" value={layer.x} onChange={(x) => set({ x }, 'x')} />
        <Num label="Y" value={layer.y} onChange={(y) => set({ y }, 'y')} />
        <Num label="Rotasi" value={layer.rotation} onChange={(rotation) => set({ rotation }, 'r')} />
      </div>
      <div className="fld opacity-field">
        <span>Opacity</span>
        <div className="opacity-row">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(layer.opacity * 100)}
          onChange={(e) => apply((p) => setLayerOpacity(p, panelId, layer.id, Number(e.target.value)), { coalesceKey: `o:${layer.id}` })}
          aria-label="Opacity"
        />
        <span className="suffix-input">
<input
          type="number"
          className="mono pct"
          min={0}
          max={100}
          value={Math.round(layer.opacity * 100)}
          onChange={(e) => apply((p) => setLayerOpacity(p, panelId, layer.id, parseFloat(e.target.value)), { coalesceKey: `o:${layer.id}` })}
        />
<span className="muted">%</span>
</span>
        </div>
      </div>
      {layer.type === 'image' && (
        <>
          <div className="grid2">
            <Num label="Lebar" value={layer.width} onChange={(width) => set({ width: Math.max(4, width) }, 'w')} />
            <Num label="Tinggi" value={layer.height} onChange={(height) => set({ height: Math.max(4, height) }, 'h')} />
          </div>
          <div className="grid2">
            <button onClick={() => set({ flipX: !layer.flipX }, 'fx')} className={layer.flipX ? 'on' : ''}>
              <FlipHorizontal2 size={14} aria-hidden /> Balik horizontal
            </button>
            <button onClick={() => set({ flipY: !layer.flipY }, 'fy')} className={layer.flipY ? 'on' : ''}>
              <FlipVertical2 size={14} aria-hidden /> Balik vertikal
            </button>
          </div>
          {layer.ref.startsWith('clip:') ? (
            <SaveClip layer={layer} panelId={panelId} />
          ) : (
            <div className="muted mono small ellipsis" title={layer.ref}>
              {layer.ref}
            </div>
          )}
        </>
      )}
      {layer.type === 'text' && (
        <>
          <label className="fld">
            <span>Isi teks</span>
            <textarea rows={2} value={layer.text} onChange={(e) => set({ text: e.target.value }, 'txt')} />
          </label>
          <div className="grid2">
            <label className="fld">
              <span>Font</span>
              <FontPicker value={layer.font} onChange={(font) => set({ font })} />
            </label>
            <Num label="Ukuran" value={layer.fontSize} onChange={(fontSize) => set({ fontSize: Math.max(8, fontSize) }, 'fs')} />
          </div>
          <div className="fld">
            <span>Warna teks</span>
            <ColorField label="Warna teks" value={layer.fill} onChange={(fill) => set({ fill }, 'fill')} />
          </div>
          <label className="check">
            <input type="checkbox" checked={!!layer.stroke} onChange={(e) => set({ stroke: e.target.checked ? '#FFFFFF' : null })} />
            Outline
          </label>
          {layer.stroke && (
            <div className="grid2 wide-first">
              <ColorField label="Warna outline" value={layer.stroke} onChange={(stroke) => set({ stroke }, 'stroke')} />
              <Num label="" value={layer.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth: Math.max(0, strokeWidth) }, 'sw')} />
            </div>
          )}
        </>
      )}
      {layer.type === 'arrow' && (
        <div className="grid2">
          <Num label="Tebal" value={layer.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth: Math.max(1, strokeWidth) }, 'sw')} />
          <div className="fld">
            <span>Warna</span>
            <ColorField label="Warna" value={layer.color} onChange={(color) => set({ color }, 'c')} />
          </div>
        </div>
      )}
      {layer.type === 'shape' && (
        <>
          <div className="grid2">
            <Num label="Lebar" value={layer.width} onChange={(width) => set({ width: Math.max(0, width) }, 'w')} />
            <Num label="Tinggi" value={layer.height} onChange={(height) => set({ height: Math.max(0, height) }, 'h')} />
          </div>
          <label className="check">
            <input type="checkbox" checked={!!layer.fill} onChange={(e) => set({ fill: e.target.checked ? '#FFFFFF' : null })} />
            Isi
          </label>
          {layer.fill && <ColorField label="Warna isi" value={layer.fill} onChange={(fill) => set({ fill }, 'fill')} />}
          <label className="check">
            <input type="checkbox" checked={!!layer.stroke} onChange={(e) => set({ stroke: e.target.checked ? '#000000' : null })} />
            Garis
          </label>
          {layer.stroke && (
            <div className="grid2 wide-first">
              <ColorField label="Warna garis" value={layer.stroke} onChange={(stroke) => set({ stroke }, 'stroke')} />
              <Num label="" value={layer.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth: Math.max(0, strokeWidth) }, 'sw')} />
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={layer.dash} onChange={(e) => set({ dash: e.target.checked })} />
            Garis putus-putus
          </label>
        </>
      )}
      {layer.type === 'emoji' && (
        <div className="grid2">
          <label className="fld">
            <span>Emoji</span>
            <input value={layer.char} onChange={(e) => e.target.value && set({ char: e.target.value }, 'ch')} />
          </label>
          <Num label="Ukuran" value={layer.size} onChange={(size) => set({ size: Math.max(8, size) }, 'sz')} />
        </div>
      )}
      <div className="layer-actions">
        <button className="ib" title="Paling depan" aria-label="Paling depan" onClick={() => apply((p) => reorderLayer(p, panelId, layer.id, 'top'))}>
          <BringToFront size={14} aria-hidden />
        </button>
        <button className="ib" title="Paling belakang" aria-label="Paling belakang" onClick={() => apply((p) => reorderLayer(p, panelId, layer.id, 'bottom'))}>
          <SendToBack size={14} aria-hidden />
        </button>
        <span className="grow" />
        <button className="danger" onClick={() => apply((p) => removeLayer(p, panelId, layer.id))}>
          <Trash2 size={14} aria-hidden /> Hapus layer
        </button>
      </div>
    </div>
  );
}

const layerLabel = (l: Layer) =>
  l.type === 'image' ? l.ref.slice(l.ref.indexOf(':') + 1) : l.type === 'text' ? `T  ${l.text}` : l.type === 'arrow' ? '↑ panah' : l.type === 'shape' ? `◇ ${l.shape}` : `${l.char} emoji`;

export function PropsPanel({ scene, number, pageIndex, assets }: { scene: Scene; number: number; pageIndex: number; assets: AssetLists }) {
  const s = useEditor();
  const project = s.project!;
  const panel = scene.panels.find((p) => p.id === s.activePanelId) ?? scene.panels[0];
  const layer = panel.layers.find((l) => l.id === s.selectedLayerId);
  const page = pageIndex >= 0 ? project.pages[pageIndex] : null;
  const onCover = pageIndex < 0 && !!project.cover;

  return (
    <div className="props">
      {onCover ? (
        <section>
          <h3>Cover</h3>
          <label className="fld">
            <span>Judul cover</span>
            <input value={project.cover!.title} onChange={(e) => s.apply((p) => updateCover(p, { title: e.target.value }), { coalesceKey: 'cover-title' })} />
          </label>
          <BgEditor
            label="Background frame"
            bg={panel.background}
            assets={assets}
            onChange={(b) => b && s.apply((p) => updatePanel(p, panel.id, (pn) => ({ ...pn, background: b })), { coalesceKey: `bg:${panel.id}` })}
          />
        </section>
      ) : (
      <section>
        <h3>Scene {number}</h3>
        <label className="fld">
          <span>Catatan efek (atas frame)</span>
          <textarea
            rows={3}
            value={scene.note}
            placeholder="mis. foil muncul dari bawah, lalu ganti gambar…"
            onChange={(e) => s.apply((p) => updateScene(p, scene.id, { note: e.target.value }), { coalesceKey: `note:${scene.id}` })}
          />
        </label>
        <label className="fld">
          <span>Subtitle / narasi (bawah frame)</span>
          <textarea
            rows={3}
            value={scene.subtitle}
            placeholder="Tempel potongan storyline di sini"
            onChange={(e) => s.apply((p) => updateScene(p, scene.id, { subtitle: e.target.value }), { coalesceKey: `sub:${scene.id}` })}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={scene.split} onChange={(e) => s.apply((p) => setSplit(p, scene.id, e.target.checked))} />
          Split atas-bawah (awal → akhir)
        </label>
        {scene.split && (
          <div className="seg full">
            {scene.panels.map((pn, i) => (
              <button key={pn.id} className={pn.id === panel.id ? 'on' : ''} onClick={() => s.setActivePanel(pn.id)}>
                {i === 0 ? 'Panel atas' : 'Panel bawah'}
              </button>
            ))}
          </div>
        )}
        <BgEditor
          label={scene.split ? 'Background panel' : 'Background scene'}
          bg={panel.background}
          assets={assets}
          onChange={(b) => b && s.apply((p) => updatePanel(p, panel.id, (pn) => ({ ...pn, background: b })), { coalesceKey: `bg:${panel.id}` })}
        />
      </section>
      )}

      <section>
        <h3>Layer</h3>
        <ul className="layer-list">
          {[...panel.layers].reverse().map((l) => (
            <li key={l.id} className={l.id === s.selectedLayerId ? 'on' : ''} onClick={() => s.selectLayer(l.id)}>
              <span className="ellipsis">{layerLabel(l)}</span>
              <span className="layer-btns">
                <button className="ib sm ghost" title="Naik" aria-label="Naik" onClick={(e) => { e.stopPropagation(); s.apply((p) => reorderLayer(p, panel.id, l.id, 'up')); }}>
                  <ChevronUp size={13} aria-hidden />
                </button>
                <button className="ib sm ghost" title="Turun" aria-label="Turun" onClick={(e) => { e.stopPropagation(); s.apply((p) => reorderLayer(p, panel.id, l.id, 'down')); }}>
                  <ChevronDown size={13} aria-hidden />
                </button>
              </span>
            </li>
          ))}
          {!panel.layers.length && <li className="muted empty">Tarik asset dari tab Asset ke canvas.</li>}
        </ul>
        {layer && <LayerProps layer={layer} panelId={panel.id} />}
      </section>

      <section>
        <h3>{page ? `Page ${pageIndex + 1}` : 'Background'}</h3>
        {page && (
          <BgEditor
            label="Background page"
            bg={page.background}
            allowInherit
            assets={assets}
            onChange={(b) => s.apply((p) => setPageBackground(p, pageIndex, b), { coalesceKey: `pbg:${page.id}` })}
          />
        )}
        <BgEditor
          label="Default semua page"
          bg={project.pageBackground}
          assets={assets}
          onChange={(b) => b && s.apply((p) => ({ ...p, pageBackground: b }), { coalesceKey: 'pbg-default' })}
        />
      </section>
    </div>
  );
}
