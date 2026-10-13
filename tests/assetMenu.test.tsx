// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { addCover, createProject } from '../src/shared/model';

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
