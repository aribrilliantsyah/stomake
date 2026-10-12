// Recreate selimut darurat scenes 1-6 via the API with the real assets, then export.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { addLayer, addSceneAfter, defaultArrow, defaultText, flatScenes, layerFromDrop, setSplit, updatePanel, updateScene } from '../src/shared/model';
import type { AssetInfo, Project } from '../src/shared/types';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5199';
const SRC = '/home/ordinary/Videos/Konten/Nah Jadi/selimut darurat';
const j = (m: string, b: unknown): RequestInit => ({ method: m, body: JSON.stringify(b), headers: { 'content-type': 'application/json' } });

const { slug } = await (await fetch(`${BASE}/api/projects`, j('POST', { name: 'Selimut Darurat' }))).json();
const fd = new FormData();
for (const n of readdirSync(join(SRC, 'img'))) fd.append('files', new File([readFileSync(join(SRC, 'img', n))], n));
const up: AssetInfo[] = await (await fetch(`${BASE}/api/assets/project/${slug}`, { method: 'POST', body: fd })).json();
const A = (name: string) => up.find((a) => a.name === name)!;
const fdg = new FormData();
fdg.append('files', new File([readFileSync(join(SRC, 'img', 'dont .png'))], 'dont .png'));
await fetch(`${BASE}/api/assets/global`, { method: 'POST', body: fdg });
const sf = new FormData();
sf.append('file', new File([readFileSync(join(SRC, 'cara kerja selimut darurat.docx'))], 'storyline.docx'));
await fetch(`${BASE}/api/projects/${slug}/storyline/import`, { method: 'POST', body: sf });

let p: Project = await (await fetch(`${BASE}/api/projects/${slug}`)).json();
let id = p.pages[0].scenes[0].id;
for (let i = 1; i < 7; i++) ({ project: p, sceneId: id } = addSceneAfter(p, id));
const S = () => flatScenes(p).map((f) => f.scene);
const full = { w: 1080, h: 1920 };
const bg = { kind: 'asset', ref: A('bg gunung.jpg').ref, fit: 'cover' } as const;
const put = (n: number, char: string, x = 540, y = 1100, scale = 1) => {
  const sc = S()[n];
  const pn = sc.panels[0];
  const l = layerFromDrop(A(char), x, y, full);
  p = addLayer(p, pn.id, { ...l, width: l.width * scale * 1.5, height: l.height * scale * 1.5 });
};
const lines = [
  ['', 'kenapa orang yang hipotermia', 'todoroki.png'],
  ['', 'kenapa orang yang hipotermia', 'todoroki kedinginan.png'],
  ['selembar alumunium foil muncul dari bawah terus ganti gambar todoroki yang di balut selimut darurat', 'biasanya dikasih selimut kayak alu-minium foil gini', 'todoroki selimutan.png'],
  ['', 'padahal ini tipis kan, emang bisa bikin anget?', 'todoroki selimutan dingin.png'],
  ['', 'ini namanya selimut darurat', 'selimut darurat.png'],
  ['munculin logam reflektif nya di masking', 'terbuat dari lembaran plastik tipis, yang dilapisin logam reflektif', 'selimut darurat plastik.png'],
  ['ubah dari beku ke normal', 'tapi kalo kebasahan', 'todoroki beku.png'],
] as const;
lines.forEach(([note, sub, img], i) => {
  const sc = S()[i];
  p = updateScene(p, sc.id, { note, subtitle: sub });
  p = updatePanel(p, sc.panels[0].id, (pn) => ({ ...pn, background: bg }));
  put(i, img);
});
// scene 3: arrow up; scene 5: title text; scene 4: emoji-like don't sticker from global
{
  const pn = S()[2].panels[0];
  p = addLayer(p, pn.id, { ...defaultArrow(full), x: 160, y: 1700 });
  const t = S()[4].panels[0];
  p = addLayer(p, t.id, { ...defaultText(full), text: 'SELIMUT DARURAT', y: 300, fontSize: 130 });
  const g = S()[3].panels[0];
  p = addLayer(p, g.id, layerFromDrop({ ...A('dont .png'), ref: 'global:dont .png' }, 820, 400, { w: 600, h: 1920 }));
}
// scene 7 split: frozen -> normal
p = setSplit(p, S()[6].id, true);
{
  const sc = S()[6];
  p = updatePanel(p, sc.panels[1].id, (pn) => ({ ...pn, layers: [layerFromDrop(A('todoroki selimutan kain.png'), 540, 560, { w: 1080, h: 960 })] }));
  p = updatePanel(p, sc.panels[0].id, (pn) => ({ ...pn, layers: [layerFromDrop(A('todoroki beku.png'), 540, 560, { w: 1080, h: 960 })] }));
}
const r = await fetch(`${BASE}/api/projects/${slug}`, j('PUT', p));
console.log('save', r.status, await r.text());
const e = await fetch(`${BASE}/api/projects/${slug}/export`, { method: 'POST' });
console.log('export', e.status, await e.text());
