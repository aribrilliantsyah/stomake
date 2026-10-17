# Storyboard Maker V4: konfigurasi MCP dan log trace

Di atas `docs/SPEC-V3.md`. Tanggal: 2026-10-17.

## 1. Tujuan

1. MCP bisa dikonfigurasi lengkap dari Pengaturan: port sendiri, izin tool, perilaku kunci editor, dan log.
2. Setiap panggilan MCP tercatat dan bisa ditelusuri di halaman **Log MCP** dengan filter.

## 2. Pengaturan (`settings.json`)

```ts
interface Settings {
  mcp: {
    enabled: boolean;              // default false
    port: number;                  // 1024..65535, default 5179; listener sendiri di 127.0.0.1
    allowedHosts: string[];        // host tambahan selain 127.0.0.1 / localhost (mis. nama di /etc/hosts), default []
    tools: Record<ToolName, boolean>; // tool yang dimatikan tidak didaftarkan (tidak muncul di tools/list); default semua true
    lock: { idleSeconds: number; ackSeconds: number }; // 3..300 / 1..30, default 10 / 3
    log: { enabled: boolean; payloads: boolean; maxEntries: number }; // default true / true / 2000 (100..20000)
  };
}
```

- File lama `{ "mcp": { "enabled": true } }` tetap terbaca; field yang tidak ada diisi default. Field asing ditolak 400.
- `PUT /api/settings` menerima patch parsial (`{ mcp: { port: 5200 } }`), digabung dengan nilai sekarang, divalidasi utuh, lalu disimpan.
- Semua perubahan berlaku tanpa restart. Ganti port: listener lama ditutup setelah yang baru berhasil dibuka. Port terpakai → 409 dengan pesan, setelan lama tetap.
- `GET /api/settings` → `mcp` berisi setelan + `url` (`http://127.0.0.1:<port>/mcp`), `listening` (bool), `listenError` (string | null), `lastCallAt`.

## 3. Listener MCP

- Server terpisah di `127.0.0.1:<mcp.port>`, hanya route `/mcp`. Route `/mcp` di port aplikasi dihapus.
- MCP mati → listener tetap jalan dan menjawab 404 `{ error: "MCP nonaktif. Nyalakan di Pengaturan." }` (agent mendapat pesan jelas, bukan connection refused).
- Header `Host` harus `127.0.0.1:<port>`, `localhost:<port>`, atau `<allowedHosts>:<port>`. Origin, jika ada, harus lokal.
- `STORYBOARD_MCP_PORT` env, bila diisi, menimpa setelan (untuk test/e2e); UI menampilkannya sebagai terkunci.

## 4. Log trace

Satu entri per request MCP:

```ts
interface McpLogEntry {
  id: number;            // naik terus
  at: string;            // ISO
  kind: 'call' | 'list' | 'init' | 'rejected' | 'other';
  tool: string | null;   // untuk call
  slug: string | null;   // dari argumen
  status: 'ok' | 'error';
  ms: number;
  client: string | null; // clientInfo.name dari initialize, atau User-Agent
  input?: unknown;       // bila log.payloads; string > 2000 karakter dipotong (svg)
  output?: unknown;      // idem
  error?: string;        // pesan isError / alasan ditolak (404 mati, 403 host, tool dimatikan)
}
```

- Disimpan di memori (ring, `maxEntries`) dan ditulis ke `<folder data>/logs/mcp.jsonl` (append). File dipangkas ke `maxEntries` baris terakhir saat lebih dari 2×.
- `GET /api/mcp/logs?q&tool&status&kind&slug&since&before&limit` → `{ items (terbaru dulu), total, tools: string[] }`. `q` mencari di tool, slug, error, client, dan isi payload.
- `GET /api/mcp/logs/export` → file `.jsonl` (hasil filter yang sama).
- `DELETE /api/mcp/logs` → kosongkan memori dan file.
- `GET /api/mcp/logs/events` (SSE) → entri baru secara live.

## 5. UI

- **Pengaturan → MCP**: switch aktif, port (+ tombol Terapkan, status listening/error), host tambahan, waktu lepas kunci, waktu tunggu editor, daftar tool dengan checkbox (dikelompokkan: Baca, Ubah, Asset, Output), log (aktif, simpan isi, jumlah maks), tombol **Buka log MCP**.
- **Halaman `/mcp-logs`**: toolbar filter (cari, tool, status, jenis, project, rentang waktu), toggle **Live**, jumlah hasil, tombol Export dan Hapus log (konfirmasi). Tabel: waktu, jenis, tool, project, status, durasi, client. Klik baris → panel detail di kanan dengan input/output JSON terformat dan tombol salin. Kosong → ajakan menyalakan MCP atau mengubah filter.
