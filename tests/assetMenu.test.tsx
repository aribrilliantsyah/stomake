// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { addCover, createProject } from '../src/shared/model';
import type * as Desktop from '../src/web/desktop';
import { api } from '../src/web/api';
import { ASSET_MIME } from '../src/web/editor/assetDrag';
import type { EventCallback } from '@tauri-apps/api/event';
const native = vi.hoisted(() => ({ desktop: false, readLocalImages: vi.fn(), listen: vi.fn() }));
vi.mock('../src/web/desktop', async (original) => ({ ...await original<typeof Desktop>(), get isDesktop() { return native.desktop; }, readLocalImages: native.readLocalImages }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ listen: native.listen }) }));

vi.mock('../src/web/api', () => ({ api: { saveProject: vi.fn().mockResolvedValue({ updatedAt: 'x' }), uploadAssets: vi.fn() } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { useEditor } = await import('../src/web/state/editorStore');
const { AssetPanel } = await import('../src/web/editor/AssetPanel');

test('cover dipilih: "Jadikan background page" nonaktif (tidak mengubah default semua page)', () => {
  const p = addCover(createProject('A', 'now'));
  useEditor.setState({ project: p, slug: 'a', selectedCover: true, currentSceneId: p.pages[0].scenes[0].id, activePanelId: p.cover!.panel.id, selectedLayerId: null });
  const assets = { project: [{ ref: 'project:bg.jpg' as const, name: 'bg.jpg', width: 10, height: 10, url: '/x' }], global: [] };
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => createRoot(host).render(<AssetPanel slug="a" assets={assets} onUploaded={() => undefined} />));
  act(() => (host.querySelector('.asset-more') as HTMLButtonElement).click());
  const btns = [...document.querySelectorAll('.popover button')] as HTMLButtonElement[];
  const pageBtn = btns.find((b) => b.textContent!.includes('background page'))!;
  expect(pageBtn.disabled).toBe(true);
  const sceneBtn = btns.find((b) => b.textContent!.includes('background'))!;
  expect(sceneBtn.disabled).toBe(false);
  act(() => pageBtn.click());
  expect(useEditor.getState().project!.pageBackground).toEqual({ kind: 'color', color: '#D4BFB3' });
});

test('desktop URI-only drop uploads into the scope selected at drop time, but ignores tile drags', async () => {
  native.desktop = true;
  const image = new File(['png'], 'shot.png', { type: 'image/png' });
  const pending = Promise.withResolvers<File[]>();
  native.readLocalImages.mockReturnValue(pending.promise);
  vi.mocked(api.uploadAssets).mockResolvedValue([{ ref: 'global:shot.png', name: 'shot.png', width: 1, height: 1, url: '' }]);
  const host = document.createElement('div');
  const root = createRoot(host);
  const onUploaded = vi.fn();
  const assets = { project: [], global: [] };
  act(() => root.render(<AssetPanel slug="a" assets={assets} onUploaded={onUploaded} />));
  const drop = (data: Record<string, string>) => {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: Object.keys(data), files: [], getData: (type: string) => data[type] ?? '' } });
    act(() => host.querySelector('.asset-panel')!.dispatchEvent(event));
    return event;
  };
  try {
    act(() => (host.querySelectorAll('.seg button')[1] as HTMLButtonElement).click());
    const payload = { 'text/uri-list': 'file:///tmp/shot.png' };
    expect(drop(payload).defaultPrevented).toBe(true);
    payload['text/uri-list'] = ''; // the event is no longer readable after dispatch
    act(() => (host.querySelectorAll('.seg button')[0] as HTMLButtonElement).click());
    await act(async () => { pending.resolve([image]); });
    expect(api.uploadAssets).toHaveBeenCalledWith('global', [image], 'a');
    expect(onUploaded).toHaveBeenCalledOnce();
    vi.mocked(api.uploadAssets).mockClear();
    expect(drop({ [ASSET_MIME]: '{}', 'text/uri-list': 'file:///tmp/shot.png' }).defaultPrevented).toBe(false);
    expect(api.uploadAssets).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    native.desktop = false;
  }
});

test('URI read completing after project switch never uploads into the new project', async () => {
  native.desktop = true;
  const pending = Promise.withResolvers<File[]>();
  native.readLocalImages.mockReturnValue(pending.promise);
  vi.mocked(api.uploadAssets).mockClear();
  const host = document.createElement('div');
  const root = createRoot(host);
  const assets = { project: [], global: [] };
  act(() => root.render(<AssetPanel slug="a" assets={assets} onUploaded={() => undefined} />));
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['text/uri-list'], files: [], getData: () => 'file:///tmp/a.png' } });
  act(() => host.querySelector('.asset-panel')!.dispatchEvent(event));
  act(() => root.render(<AssetPanel slug="b" assets={assets} onUploaded={() => undefined} />));
  await act(async () => { pending.resolve([new File(['png'], 'a.png', { type: 'image/png' })]); });
  expect(api.uploadAssets).not.toHaveBeenCalled();
  act(() => root.unmount());
  native.desktop = false;
});

test('Linux native OS drops upload only inside the visible Assets panel', async () => {
  native.desktop = true;
  const platform = vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
  type FileDrop = { uris: string[]; position: { x: number; y: number } };
  let handler: EventCallback<FileDrop> | undefined;
  const unlisten = vi.fn();
  native.listen.mockImplementation(async (event: string, callback: EventCallback<FileDrop>) => {
    expect(event).toBe('storyboard://file-drop');
    handler = callback;
    return unlisten;
  });
  const file = new File(['png'], 'native #shot.png', { type: 'image/png' });
  native.readLocalImages.mockResolvedValue([file]);
  vi.mocked(api.uploadAssets).mockReset().mockResolvedValue([{ ref: 'project:native.png', name: 'native.png', width: 1, height: 1, url: '' }]);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AssetPanel slug="a" assets={{ project: [], global: [] }} onUploaded={() => undefined} />));
    const panel = host.querySelector('.asset-panel')!;
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100, right: 400, bottom: 500, width: 300, height: 400, x: 100, y: 100, toJSON: () => ({}) });
    const drop = (x: number, y: number) => handler!({ event: 'storyboard://file-drop', id: 1, payload: { uris: ['file:///tmp/native%20%23shot.png'], position: { x, y } } });
    await act(async () => { drop(50, 50); });
    expect(api.uploadAssets).not.toHaveBeenCalled();
    await act(async () => { drop(200, 200); });
    expect(native.readLocalImages).toHaveBeenCalledWith(['file:///tmp/native%20%23shot.png']);
    expect(api.uploadAssets).toHaveBeenCalledWith('project', [file], 'a');
    vi.mocked(api.uploadAssets).mockClear();
    panel.setAttribute('hidden', '');
    await act(async () => { drop(200, 200); });
    expect(api.uploadAssets).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    expect(unlisten).toHaveBeenCalledOnce();
    platform.mockRestore();
    native.desktop = false;
    host.remove();
  }
});
