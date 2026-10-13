import { removeLayer, reorderLayer, setPageBackground, setSplit, updateLayer, updatePanel, updateScene } from '../../shared/model';
import type { AssetRef, Background, FontName, Layer, Scene } from '../../shared/types';
import type { AssetLists } from '../api';
import { useEditor } from '../state/editorStore';

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="field num-field">
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
      <div className="field">
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
      </div>
      {bg?.kind === 'color' && (
        <div className="field">
          <span />
          <input type="color" value={bg.color} onChange={(e) => onChange({ kind: 'color', color: e.target.value.toUpperCase() })} />
          <input className="mono hex" value={bg.color} onChange={(e) => onChange({ kind: 'color', color: e.target.value })} />
        </div>
      )}
      {bg?.kind === 'asset' && (
        <>
          <div className="field">
            <span />
            <select value={bg.ref} onChange={(e) => onChange({ ...bg, ref: e.target.value as AssetRef })}>
              {!all.some((a) => a.ref === bg.ref) && <option value={bg.ref}>{bg.ref} (hilang)</option>}
              {assets.project.length > 0 && (
                <optgroup label="Project">
                  {assets.project.map((a) => (
                    <option key={a.ref} value={a.ref}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {assets.global.length > 0 && (
                <optgroup label="Global">
                  {assets.global.map((a) => (
                    <option key={a.ref} value={a.ref}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="field">
            <span />
            <select value={bg.fit} onChange={(e) => onChange({ ...bg, fit: e.target.value as 'cover' | 'contain' })}>
              <option value="cover">Penuhi (cover)</option>
              <option value="contain">Muat (contain)</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}

function LayerProps({ layer, panelId }: { layer: Layer; panelId: string }) {
  const apply = useEditor((s) => s.apply);
  const set = (patch: Partial<Layer>, key = 'f') => apply((p) => updateLayer(p, panelId, layer.id, patch), { coalesceKey: `${key}:${layer.id}` });
  return (
    <div className="layer-props">
      <div className="grid2">
        <Num label="X" value={layer.x} onChange={(x) => set({ x }, 'x')} />
        <Num label="Y" value={layer.y} onChange={(y) => set({ y }, 'y')} />
        <Num label="Rotasi" value={layer.rotation} onChange={(rotation) => set({ rotation }, 'r')} />
        <Num label="Opacity" value={layer.opacity} step={0.05} onChange={(v) => set({ opacity: Math.max(0, Math.min(1, v)) }, 'o')} />
      </div>
      {layer.type === 'image' && (
        <>
          <div className="grid2">
            <Num label="Lebar" value={layer.width} onChange={(width) => set({ width: Math.max(4, width) }, 'w')} />
            <Num label="Tinggi" value={layer.height} onChange={(height) => set({ height: Math.max(4, height) }, 'h')} />
          </div>
          <div className="row">
            <button onClick={() => set({ flipX: !layer.flipX }, 'fx')} className={layer.flipX ? 'on' : ''}>
              Flip ↔
            </button>
            <button onClick={() => set({ flipY: !layer.flipY }, 'fy')} className={layer.flipY ? 'on' : ''}>
              Flip ↕
            </button>
          </div>
          <div className="muted mono small">{layer.ref}</div>
        </>
      )}
      {layer.type === 'text' && (
        <>
          <label className="field col">
            <span>Isi teks</span>
            <textarea rows={2} value={layer.text} onChange={(e) => set({ text: e.target.value }, 'txt')} />
          </label>
          <div className="grid2">
            <label className="field num-field">
              <span>Font</span>
              <select value={layer.font} onChange={(e) => set({ font: e.target.value as FontName })}>
                <option>Bangers</option>
                <option>Coming Soon</option>
                <option>Inter</option>
              </select>
            </label>
            <Num label="Ukuran" value={layer.fontSize} onChange={(fontSize) => set({ fontSize: Math.max(8, fontSize) }, 'fs')} />
          </div>
          <div className="row">
            <span className="lbl">Warna</span>
            <input type="color" value={layer.fill} onChange={(e) => set({ fill: e.target.value }, 'fill')} />
            <span className="lbl">Outline</span>
            <input type="checkbox" checked={!!layer.stroke} onChange={(e) => set({ stroke: e.target.checked ? '#FFFFFF' : null })} />
            {layer.stroke && <input type="color" value={layer.stroke} onChange={(e) => set({ stroke: e.target.value }, 'stroke')} />}
          </div>
          {layer.stroke && <Num label="Tebal outline" value={layer.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth: Math.max(0, strokeWidth) }, 'sw')} />}
        </>
      )}
      {layer.type === 'arrow' && (
        <div className="row">
          <Num label="Tebal" value={layer.strokeWidth} onChange={(strokeWidth) => set({ strokeWidth: Math.max(1, strokeWidth) }, 'sw')} />
          <input type="color" value={layer.color} onChange={(e) => set({ color: e.target.value }, 'c')} />
        </div>
      )}
      {layer.type === 'emoji' && (
        <div className="grid2">
          <label className="field num-field">
            <span>Emoji</span>
            <input value={layer.char} onChange={(e) => e.target.value && set({ char: e.target.value }, 'ch')} />
          </label>
          <Num label="Ukuran" value={layer.size} onChange={(size) => set({ size: Math.max(8, size) }, 'sz')} />
        </div>
      )}
      <div className="row">
        <button onClick={() => apply((p) => reorderLayer(p, panelId, layer.id, 'top'))}>Paling depan</button>
        <button onClick={() => apply((p) => reorderLayer(p, panelId, layer.id, 'bottom'))}>Paling belakang</button>
        <button className="danger" onClick={() => apply((p) => removeLayer(p, panelId, layer.id))}>
          Hapus
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
  const page = project.pages[pageIndex];

  return (
    <div className="props">
      <section>
        <h3>Scene {number}</h3>
        <label className="field col">
          <span>Catatan efek (atas frame)</span>
          <textarea
            rows={3}
            value={scene.note}
            placeholder="mis. foil muncul dari bawah, lalu ganti gambar…"
            onChange={(e) => s.apply((p) => updateScene(p, scene.id, { note: e.target.value }), { coalesceKey: `note:${scene.id}` })}
          />
        </label>
        <label className="field col">
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
          <div className="seg">
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

      <section>
        <h3>Layer</h3>
        <ul className="layer-list">
          {[...panel.layers].reverse().map((l) => (
            <li key={l.id} className={l.id === s.selectedLayerId ? 'on' : ''} onClick={() => s.selectLayer(l.id)}>
              <span className="ellipsis">{layerLabel(l)}</span>
              <span className="layer-btns">
                <button title="Naik" onClick={(e) => { e.stopPropagation(); s.apply((p) => reorderLayer(p, panel.id, l.id, 'up')); }}>
                  ▲
                </button>
                <button title="Turun" onClick={(e) => { e.stopPropagation(); s.apply((p) => reorderLayer(p, panel.id, l.id, 'down')); }}>
                  ▼
                </button>
              </span>
            </li>
          ))}
          {!panel.layers.length && <li className="muted empty">Tarik asset dari tab Asset ke canvas.</li>}
        </ul>
        {layer && <LayerProps layer={layer} panelId={panel.id} />}
      </section>

      <section>
        <h3>Page {pageIndex + 1}</h3>
        <BgEditor
          label="Background page"
          bg={page.background}
          allowInherit
          assets={assets}
          onChange={(b) => s.apply((p) => setPageBackground(p, pageIndex, b), { coalesceKey: `pbg:${page.id}` })}
        />
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
