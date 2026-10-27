import { Check, Copy, ScrollText } from 'lucide-react';
import { useState } from 'react';
import type { McpToolGroup, SettingsView } from '../../shared/types';
import { api } from '../api';
import { relativeTime } from '../projects/homeState';
import { navigate } from '../router';
import { useUi } from '../state/uiStore';

export function mcpConfigJson(url: string): string {
  return JSON.stringify({ mcpServers: { 'stomake': { type: 'http', url } } }, null, 2);
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const toast = useUi((u) => u.toast);
  return (
    <button
      className="ib ghost"
      title={label}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast('ok', 'Disalin');
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast('err', 'Gagal menyalin');
        }
      }}
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
    </button>
  );
}

const GROUPS: { id: McpToolGroup; label: string }[] = [
  { id: 'read', label: 'Membaca' },
  { id: 'edit', label: 'Mengubah project' },
  { id: 'asset', label: 'Membuat gambar' },
  { id: 'output', label: 'Export & sesi' },
];

type Mcp = SettingsView['mcp'];
type Patch = Parameters<typeof api.putSettings>[0]['mcp'];

/**
 * Everything under Pengaturan → MCP. Each change is saved on its own (toggles at once,
 * numbers on blur/Enter) so a bad value only bounces that one field.
 */
export function McpSettings({ mcp, onSaved, onOpenLog }: { mcp: Mcp; onSaved(s: SettingsView): void; onOpenLog(): void }) {
  const toast = useUi((u) => u.toast);
  const [busy, setBusy] = useState(false);
  const [port, setPort] = useState(String(mcp.port));
  const [hosts, setHosts] = useState(mcp.allowedHosts.join(', '));

  async function save(patch: Patch, okText?: string) {
    setBusy(true);
    try {
      onSaved(await api.putSettings({ mcp: patch }));
      if (okText) toast('ok', okText);
      return true;
    } catch (e) {
      toast('err', (e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function applyPort() {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) {
      toast('err', 'Port harus angka 1024–65535');
      setPort(String(mcp.port));
      return;
    }
    if (n === mcp.port) return;
    if (!(await save({ port: n }, `MCP sekarang di port ${n}. Perbarui URL di agent Anda.`))) setPort(String(mcp.port));
  }

  function applyHosts() {
    const list = hosts
      .split(/[\s,]+/)
      .map((h) => h.trim())
      .filter(Boolean);
    if (list.join(',') !== mcp.allowedHosts.join(',')) void save({ allowedHosts: list }).then((ok) => !ok && setHosts(mcp.allowedHosts.join(', ')));
  }

  const num = (value: number, min: number, max: number, put: (n: number) => Patch) => ({
    type: 'number',
    min,
    max,
    defaultValue: value,
    disabled: busy,
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      const n = Math.round(Number(e.target.value));
      if (n === value) return;
      if (!Number.isFinite(n) || n < min || n > max) {
        toast('err', `Isi angka ${min}–${max}`);
        e.target.value = String(value);
        return;
      }
      void save(put(n)).then((ok) => !ok && (e.target.value = String(value)));
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur(),
  });

  const off = mcp.toolList.filter((t) => mcp.tools[t.name] === false).length;

  return (
    <div className="mcp-set">
      <div className={mcp.enabled ? '' : 'set-off'}>
        <div className="field col">
          <span>URL</span>
          <div className="copy-row">
            <code className="mcp-url mono">{mcp.url}</code>
            <CopyButton text={mcp.url} label="Salin URL" />
          </div>
        </div>
        <div className="field col">
          <span>Konfigurasi client</span>
          <div className="copy-row top">
            <pre className="mcp-config mono">{mcpConfigJson(mcp.url)}</pre>
            <CopyButton text={mcpConfigJson(mcp.url)} label="Salin konfigurasi" />
          </div>
        </div>
        <p className="hint">
          {mcp.listening ? 'Siap menerima koneksi.' : `Tidak jalan: ${mcp.listenError ?? 'belum dibuka'}.`} Agent terakhir aktif: {mcp.lastCallAt ? relativeTime(mcp.lastCallAt) : 'belum pernah'}.
        </p>
      </div>

      <details className="set-more">
        <summary>Koneksi</summary>
        <label className="field">
          <span>Port</span>
          <div className="row tight">
            <input
              className="mono"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && void applyPort()}
              disabled={busy || mcp.portFromEnv}
              aria-label="Port MCP"
            />
            <button onClick={applyPort} disabled={busy || mcp.portFromEnv || port === String(mcp.port)}>
              Terapkan
            </button>
          </div>
        </label>
        <p className="hint">
          {mcp.portFromEnv ? 'Diatur oleh variabel STORYBOARD_MCP_PORT.' : 'Hanya bisa diakses dari laptop ini (127.0.0.1). Port berubah langsung, tanpa restart.'}
        </p>
        <label className="field">
          <span>Host tambahan</span>
          <input
            value={hosts}
            placeholder="mis. storyboard.local"
            onChange={(e) => setHosts(e.target.value)}
            onBlur={applyHosts}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            disabled={busy}
            aria-label="Host tambahan"
          />
        </label>
        <p className="hint">Nama lain untuk 127.0.0.1 yang boleh dipakai di URL, dipisah koma. Kosongkan bila tidak perlu.</p>
      </details>

      <details className="set-more">
        <summary>Kunci editor</summary>
        <label className="field">
          <span>Lepas setelah</span>
          <div className="row tight">
            <input {...num(mcp.lock.idleSeconds, 3, 300, (n) => ({ lock: { idleSeconds: n } }))} aria-label="Lepas kunci setelah (detik)" />
            <span className="muted">detik tanpa panggilan</span>
          </div>
        </label>
        <label className="field">
          <span>Tunggu editor</span>
          <div className="row tight">
            <input {...num(mcp.lock.ackSeconds, 1, 30, (n) => ({ lock: { ackSeconds: n } }))} aria-label="Tunggu editor menyimpan (detik)" />
            <span className="muted">detik maks</span>
          </div>
        </label>
        <p className="hint">Selama agent bekerja, editor dikunci. Sebelum agent mulai, editor diberi waktu menyimpan perubahan yang belum tersimpan.</p>
      </details>

      <details className="set-more">
        <summary>
          Izin tool <span className="muted">{off ? `${mcp.toolList.length - off} dari ${mcp.toolList.length} aktif` : `semua ${mcp.toolList.length} aktif`}</span>
        </summary>
        <p className="hint">Tool yang dimatikan tidak terlihat oleh agent. Panggilannya tetap ditolak dan tercatat di log.</p>
        {GROUPS.map((g) => {
          const tools = mcp.toolList.filter((t) => t.group === g.id);
          const on = tools.filter((t) => mcp.tools[t.name] !== false).length;
          const allOn = on === tools.length;
          return (
            <fieldset key={g.id} className="tool-group" disabled={busy}>
              <legend>
                <label>
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = on > 0 && !allOn;
                    }}
                    onChange={() => void save({ tools: Object.fromEntries(tools.map((t) => [t.name, !allOn])) })}
                  />
                  {g.label}
                  {!allOn && <span className="muted">{on} dari {tools.length}</span>}
                </label>
              </legend>
              {tools.map((t) => (
                <label key={t.name} className="tool-row" title={t.description}>
                  <input type="checkbox" checked={mcp.tools[t.name] !== false} onChange={(e) => void save({ tools: { [t.name]: e.target.checked } })} />
                  <code className="mono">{t.name}</code>
                </label>
              ))}
            </fieldset>
          );
        })}
      </details>

      <details className="set-more">
        <summary>Log</summary>
        <label className="check-row">
          <input type="checkbox" checked={mcp.log.enabled} onChange={(e) => void save({ log: { enabled: e.target.checked } })} disabled={busy} />
          Catat setiap panggilan agent
        </label>
        <label className="check-row">
          <input type="checkbox" checked={mcp.log.payloads} onChange={(e) => void save({ log: { payloads: e.target.checked } })} disabled={busy || !mcp.log.enabled} />
          Simpan isi input dan hasil (teks panjang dipotong)
        </label>
        <label className="field">
          <span>Simpan maks</span>
          <div className="row tight">
            <input {...num(mcp.log.maxEntries, 100, 20000, (n) => ({ log: { maxEntries: n } }))} disabled={busy || !mcp.log.enabled} aria-label="Jumlah log maksimum" />
            <span className="muted">entri terbaru</span>
          </div>
        </label>
      </details>

      <div className="row">
        <button
          onClick={() => {
            onOpenLog();
            navigate('/mcp-logs');
          }}
        >
          <ScrollText size={14} aria-hidden /> Buka log MCP
        </button>
      </div>
    </div>
  );
}
