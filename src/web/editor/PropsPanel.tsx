import { GripVertical, ChevronRight, Group, Ungroup, ImagePlus, Loader2, BringToFront, ChevronDown, ChevronUp, FlipHorizontal2, FlipVertical2, SendToBack, Trash2 } from 'lucide-react';
import { replaceRef, removeLayer, reorderLayer, setLayerOpacity, setPageBackground, setSplit, updateCover, updateLayer, updatePanel, updateScene } from '../../shared/model';
import type { Background, Layer, Scene } from '../../shared/types';
import { AssetPicker } from './AssetPicker';
import { FontPicker } from './FontPicker';
import { api, type AssetLists } from '../api';
import { toast } from '../state/uiStore';
import { useState } from 'react';
import { SHAPES } from './ShapeMenu';
import { groupLayers, moveLayersTo, removeLayers, reorderLayers, setLayersOpacity, ungroupLayers } from '../../shared/multi';
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
  l.type === 'image' ? l.ref.slice(l.ref.indexOf(':') + 1) : l.type === 'text' ? `T  ${l.text}` : l.type === 'arrow' ? '↑ panah' : l.type === 'shape' ? `◇ ${SHAPES.find((x) => x.kind === l.shape)?.label ?? l.shape}` : `${l.char} emoji`;

type Row = { kind: 'layer'; layer: Layer; inGroup: boolean } | { kind: 'group'; groupId: string; members: Layer[] };

/** front-most first; a group becomes one header row followed by its members (members sit next to each other) */
function layerRows(layers: Layer[], open: Set<string>): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const l of [...layers].reverse()) {
    if (!l.groupId) {
      rows.push({ kind: 'layer', layer: l, inGroup: false });
      continue;
    }
    if (seen.has(l.groupId)) continue;
    seen.add(l.groupId);
    const members = layers.filter((x) => x.groupId === l.groupId).reverse();
    rows.push({ kind: 'group', groupId: l.groupId, members });
    if (open.has(l.groupId)) for (const m of members) rows.push({ kind: 'layer', layer: m, inGroup: true });
  }
  return rows;
}

type Drop = { anchor: string; side: 'front' | 'back'; intoGroup: string | null; key: string };

function LayerList({ panelId, layers }: { panelId: string; layers: Layer[] }) {
  const s = useEditor();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<string[] | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const sel = new Set(s.selectedLayerIds);
  const pick = (e: React.MouseEvent, id: string, single = false) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) s.toggleLayer(id);
    else s.selectLayer(id, { single });
  };
  const move = (e: React.MouseEvent, ids: string[], dir: 'up' | 'down') => {
    e.stopPropagation();
    s.apply((p) => reorderLayers(p, panelId, ids, dir));
  };
  const rows = layerRows(layers, open);
  const locked = s.agentActive;

  /** what gets dragged: a group row = the group; a selected row = the whole selection; else that row (and its group unless it's an opened member) */
  const dragIds = (row: Row): string[] => {
    if (row.kind === 'group') return row.members.map((m) => m.id);
    if (sel.has(row.layer.id) && s.selectedLayerIds.length > 1) return s.selectedLayerIds;
    return [row.layer.id];
  };
  /** list is front-most first: upper half of a row = in front of it */
  const dropFor = (row: Row, e: React.DragEvent): Drop => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const upper = e.clientY < r.top + r.height / 2;
    if (row.kind === 'group') {
      // header: above = in front of the whole group; below = into the group when open, else behind it
      const front = row.members[0].id;
      const back = row.members[row.members.length - 1].id;
      if (upper) return { anchor: front, side: 'front', intoGroup: null, key: `g:${row.groupId}:t` };
      return open.has(row.groupId)
        ? { anchor: front, side: 'front', intoGroup: row.groupId, key: `g:${row.groupId}:b` }
        : { anchor: back, side: 'back', intoGroup: null, key: `g:${row.groupId}:b` };
    }
    const g = row.inGroup ? (row.layer.groupId ?? null) : null;
    return { anchor: row.layer.id, side: upper ? 'front' : 'back', intoGroup: g, key: `${row.layer.id}:${upper ? 't' : 'b'}` };
  };
  const rowKey = (row: Row) => (row.kind === 'group' ? `g:${row.groupId}` : row.layer.id);
  const dndProps = (row: Row) =>
    locked
      ? {}
      : {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            const ids = dragIds(row);
            setDrag(ids);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-storyboard-layers', ids.join(','));
          },
          onDragOver: (e: React.DragEvent) => {
            if (!drag) return;
            const d = dropFor(row, e);
            if (drag.includes(d.anchor) && !d.intoGroup) return setDrop(null);
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (d.key !== drop?.key) setDrop(d);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const ids = drag;
            const d = drop ?? (ids ? dropFor(row, e) : null);
            setDrag(null);
            setDrop(null);
            if (!ids || !d) return;
            s.apply((p) => moveLayersTo(p, panelId, ids, d.anchor, d.side, d.intoGroup));
            s.setSelection(ids);
          },
          onDragEnd: () => {
            setDrag(null);
            setDrop(null);
          },
        };
  const dropClass = (row: Row) => {
    if (!drop) return '';
    const k = rowKey(row);
    if (drop.key === `${k}:t`) return ' drop-above';
    if (drop.key === `${k}:b`) return drop.intoGroup && row.kind === 'group' ? ' drop-into' : ' drop-below';
    return '';
  };
  const dragging = (row: Row) => (drag && dragIds(row).every((id) => drag.includes(id)) ? ' dragging' : '');

  return (
    <ul className={`layer-list${drag ? ' is-dragging' : ''}`} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(null)}>
      {rows.map((row) => {
        if (row.kind === 'group') {
          const ids = row.members.map((m) => m.id);
          const on = ids.every((id) => sel.has(id));
          const isOpen = open.has(row.groupId);
          return (
            <li key={`g:${row.groupId}`} className={`group-row${on ? ' on' : ''}${dropClass(row)}${dragging(row)}`} onClick={(e) => pick(e, ids[0])} {...dndProps(row)}>
              <GripVertical size={12} aria-hidden className="grip" />
              <button
                className="ib sm ghost"
                aria-label={isOpen ? 'Tutup grup' : 'Buka grup'}
                title={isOpen ? 'Tutup grup' : 'Buka grup'}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((o) => {
                    const n = new Set(o);
                    if (n.has(row.groupId)) n.delete(row.groupId);
                    else n.add(row.groupId);
                    return n;
                  });
                }}
              >
                {isOpen ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
              </button>
              <Group size={13} aria-hidden className="muted" />
              <span className="ellipsis">Grup</span>
              <span className="muted mono small">{row.members.length}</span>
              <span className="layer-btns">
                <button className="ib sm ghost" title="Naik" aria-label="Naik" onClick={(e) => move(e, ids, 'up')}>
                  <ChevronUp size={13} aria-hidden />
                </button>
                <button className="ib sm ghost" title="Turun" aria-label="Turun" onClick={(e) => move(e, ids, 'down')}>
                  <ChevronDown size={13} aria-hidden />
                </button>
              </span>
            </li>
          );
        }
        const l = row.layer;
        return (
          <li
            key={l.id}
            className={`${sel.has(l.id) ? 'on' : ''}${row.inGroup ? ' member' : ''}${dropClass(row)}${dragging(row)}`}
            onClick={(e) => pick(e, l.id, row.inGroup)}
            {...dndProps(row)}
          >
            <GripVertical size={12} aria-hidden className="grip" />
            <span className="ellipsis">{layerLabel(l)}</span>
            {!row.inGroup && (
              <span className="layer-btns">
                <button className="ib sm ghost" title="Naik" aria-label="Naik" onClick={(e) => move(e, [l.id], 'up')}>
                  <ChevronUp size={13} aria-hidden />
                </button>
                <button className="ib sm ghost" title="Turun" aria-label="Turun" onClick={(e) => move(e, [l.id], 'down')}>
                  <ChevronDown size={13} aria-hidden />
                </button>
              </span>
            )}
          </li>
        );
      })}
      {!layers.length && <li className="muted empty">Tarik asset dari tab Asset ke canvas.</li>}
    </ul>
  );
}

/** several layers selected: only what applies to all of them */
function MultiProps({ panelId, layers }: { panelId: string; layers: Layer[] }) {
  const s = useEditor();
  const ids = s.selectedLayerIds;
  const sel = layers.filter((l) => ids.includes(l.id));
  const gid = sel[0]?.groupId;
  const oneGroup = !!gid && sel.every((l) => l.groupId === gid) && layers.filter((l) => l.groupId === gid).length === sel.length;
  const anyGroup = sel.some((l) => l.groupId);
  const op = Math.round((sel.reduce((n, l) => n + l.opacity, 0) / Math.max(1, sel.length)) * 100);
  const mixedOpacity = sel.some((l) => Math.round(l.opacity * 100) !== Math.round(sel[0].opacity * 100));
  return (
    <div className="layer-props">
      <div className="multi-head">
        <span className="small muted">{oneGroup ? `Grup · ${sel.length} layer` : `${sel.length} layer dipilih`}</span>
      </div>
      <div className="layer-actions top">
        <button className="ib" title="Paling depan" aria-label="Paling depan" onClick={() => s.apply((p) => reorderLayers(p, panelId, ids, 'top'))}>
          <BringToFront size={14} aria-hidden />
        </button>
        <button className="ib" title="Paling belakang" aria-label="Paling belakang" onClick={() => s.apply((p) => reorderLayers(p, panelId, ids, 'bottom'))}>
          <SendToBack size={14} aria-hidden />
        </button>
        <span className="grow" />
        <button
          className="danger"
          onClick={() => {
            s.apply((p) => removeLayers(p, panelId, ids));
            s.selectLayer(null);
          }}
        >
          <Trash2 size={14} aria-hidden /> Hapus {sel.length} layer
        </button>
      </div>
      <div className="grid2">
        <button
          disabled={oneGroup}
          title="Kelompokkan (Ctrl+G)"
          onClick={() => {
            s.apply((p) => groupLayers(p, panelId, ids).project);
            s.setSelection(ids);
          }}
        >
          <Group size={14} aria-hidden /> Group
        </button>
        <button
          disabled={!anyGroup}
          title="Pisahkan grup (Ctrl+Shift+G)"
          onClick={() => {
            s.apply((p) => ungroupLayers(p, panelId, ids));
            s.setSelection(ids);
          }}
        >
          <Ungroup size={14} aria-hidden /> Ungroup
        </button>
      </div>
      <div className="fld opacity-field">
        <span>Opacity{mixedOpacity ? ' (campuran)' : ''}</span>
        <div className="opacity-row">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={op}
            onChange={(e) => s.apply((p) => setLayersOpacity(p, panelId, ids, Number(e.target.value)), { coalesceKey: `o:${ids.join(',')}` })}
            aria-label="Opacity"
          />
          <span className="suffix-input">
            <input
              type="number"
              className="mono pct"
              min={0}
              max={100}
              value={op}
              onChange={(e) => s.apply((p) => setLayersOpacity(p, panelId, ids, parseFloat(e.target.value)), { coalesceKey: `o:${ids.join(',')}` })}
            />
            <span className="muted">%</span>
          </span>
        </div>
      </div>
      <p className="muted small hint-multi">Geser salah satu untuk memindahkan semuanya. Shift/Ctrl+klik untuk menambah atau mengurangi pilihan, panah untuk menggeser.</p>
    </div>
  );
}

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
        <h3>
          Layer
          {s.selectedLayerIds.length > 1 && <span className="h3-count mono">{s.selectedLayerIds.length} dipilih</span>}
        </h3>
        <LayerList panelId={panel.id} layers={panel.layers} />
        {s.selectedLayerIds.length > 1 ? <MultiProps panelId={panel.id} layers={panel.layers} /> : layer && <LayerProps layer={layer} panelId={panel.id} />}
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
