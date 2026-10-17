import { FolderOpen, HardDrive, Monitor, Moon, Plug, Settings, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SettingsView } from '../../shared/types';
import { api } from '../api';
import { isDesktop, pickFolder, revealFolder } from '../desktop';
import { useTheme, type ThemePref } from '../state/theme';
import { useUi } from '../state/uiStore';
import { Dialog } from './Dialog';
import { Spinner } from './Loading';
import { McpSettings } from './McpSettings';

const THEMES: { v: ThemePref; label: string; icon: typeof Sun }[] = [
  { v: 'light', label: 'Terang', icon: Sun },
  { v: 'dark', label: 'Gelap', icon: Moon },
  { v: 'system', label: 'Ikuti sistem', icon: Monitor },
];

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const pref = useTheme((t) => t.pref);
  const setPref = useTheme((t) => t.setPref);
  const toast = useUi((u) => u.toast);
  const [s, setS] = useState<SettingsView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getSettings().then(setS, (e) => toast('err', (e as Error).message));
  }, [toast]);

  async function toggleMcp() {
    if (!s || busy) return;
    setBusy(true);
    try {
      setS(await api.putSettings({ mcp: { enabled: !s.mcp.enabled } }));
    } catch (e) {
      toast('err', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeFolder() {
    if (!s || busy) return;
    const dir = await pickFolder(s.storage.dataRoot);
    if (!dir || dir === s.storage.dataRoot) return;
    setBusy(true);
    try {
      setS(await api.setDataRoot(dir));
      toast('ok', `Folder penyimpanan: ${dir}`);
      // every open list/editor reads from the old folder: start fresh on Home
      location.assign('/');
    } catch (e) {
      toast('err', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Pengaturan" onClose={onClose} footer={<button onClick={onClose}>Tutup</button>}>
      <section className="set-section">
        <h3>Tema</h3>
        <div className="seg" role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => (
            <label key={t.v} className={`seg-radio${pref === t.v ? ' on' : ''}`}>
              <input type="radio" name="theme" value={t.v} checked={pref === t.v} onChange={() => setPref(t.v)} aria-label={t.label} />
              <t.icon size={14} aria-hidden /> {t.label}
            </label>
          ))}
        </div>
      </section>

      <section className="set-section">
        <h3>
          <HardDrive size={14} aria-hidden /> Folder penyimpanan
        </h3>
        {s === null ? (
          <Spinner />
        ) : (
          <>
            <div className="copy-row">
              <code className="path-box mono" data-testid="data-root">{s.storage.dataRoot}</code>
              {isDesktop && (
                <button className="ib" onClick={() => void revealFolder(s.storage.dataRoot)} title="Buka di file manager" aria-label="Buka folder">
                  <FolderOpen size={14} aria-hidden />
                </button>
              )}
            </div>
            <div className="row">
              <button onClick={changeFolder} disabled={busy || s.storage.fixedByEnv}>
                Ganti folder…
              </button>
            </div>
            <p className="hint">
              {s.storage.fixedByEnv
                ? 'Diatur oleh variabel STORYBOARD_HOME.'
                : 'Project ada di subfolder projects/. Folder project yang di-copy ke sana langsung muncul di Home. Data di folder lama tidak dipindah.'}
            </p>
          </>
        )}
      </section>

      <section className="set-section">
        <div className="set-row">
          <h3>
            <Plug size={14} aria-hidden /> MCP (agent AI)
          </h3>
          <span className="grow" />
          {s === null ? (
            <Spinner />
          ) : (
            <button role="switch" aria-checked={s.mcp.enabled} aria-label="Aktifkan MCP" className={`switch${s.mcp.enabled ? ' on' : ''}`} onClick={toggleMcp} disabled={busy}>
              <span className="knob" />
            </button>
          )}
        </div>
        <p className="hint">Agent seperti Hermes, Claude Code, atau Cursor bisa membuat dan mengedit storyboard lewat alamat ini. Hanya bisa diakses dari laptop ini.</p>
        {s && <McpSettings mcp={s.mcp} onSaved={setS} onOpenLog={onClose} />}
      </section>
    </Dialog>
  );
}

/** Gear button that opens the settings dialog. */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="ib ghost" onClick={() => setOpen(true)} title="Pengaturan" aria-label="Pengaturan">
        <Settings size={15} aria-hidden />
      </button>
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}
