// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { Popover } from '../src/web/ui/Popover';
import { AssetPicker } from '../src/web/editor/AssetPicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
afterEach(() => {
  host?.remove();
  document.body.innerHTML = '';
});

function mount(node: React.ReactNode) {
  host = document.createElement('div');
  host.style.overflow = 'hidden';
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return root;
}

test('Popover dirender di document.body (portal), bukan di dalam panel yang overflow:hidden', () => {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  mount(
    <Popover anchor={anchor} open onClose={() => undefined} width={200}>
      <div id="isi">isi menu</div>
    </Popover>,
  );
  const el = document.getElementById('isi')!;
  expect(el).not.toBeNull();
  expect(host.contains(el)).toBe(false);
  const pop = el.closest('.popover') as HTMLElement;
  expect(pop.parentElement).toBe(document.body);
  expect(pop.style.position || getComputedStyle(pop).position).toBe('fixed');
});

test('Popover tutup saat klik di luar dan Escape, tidak saat klik di dalam', () => {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  const onClose = vi.fn();
  mount(
    <Popover anchor={anchor} open onClose={onClose}>
      <button id="dalam">x</button>
    </Popover>,
  );
  act(() => document.getElementById('dalam')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(onClose).not.toHaveBeenCalled();
  act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(onClose).toHaveBeenCalledTimes(2);
});

const assets = {
  project: [
    { ref: 'project:bg gunung.jpg' as const, name: 'bg gunung.jpg', width: 1920, height: 1080, url: '/files/project/a/bg%20gunung.jpg' },
    { ref: 'project:todoroki.png' as const, name: 'todoroki.png', width: 10, height: 10, url: '/files/project/a/todoroki.png' },
  ],
  global: [{ ref: 'global:dont .png' as const, name: 'dont .png', width: 10, height: 10, url: '/files/global/dont%20.png' }],
};

test('AssetPicker: tombol menampilkan preview aset terpilih; menu berisi thumbnail tiap aset; pilih → onChange(ref)', () => {
  const onChange = vi.fn();
  mount(<AssetPicker value="project:bg gunung.jpg" assets={assets} onChange={onChange} />);
  const trigger = host.querySelector('.asset-picker-trigger') as HTMLButtonElement;
  expect(trigger.querySelector('img')!.getAttribute('src')).toBe('/files/project/a/bg%20gunung.jpg');
  expect(trigger.textContent).toContain('bg gunung.jpg');
  act(() => trigger.click());
  const items = [...document.querySelectorAll('.asset-pick')] as HTMLButtonElement[];
  expect(items).toHaveLength(3);
  expect(items.map((b) => b.querySelector('img')!.getAttribute('src'))).toEqual(assets.project.map((a) => a.url).concat(assets.global[0].url));
  act(() => items[2].click());
  expect(onChange).toHaveBeenCalledWith('global:dont .png');
  expect(document.querySelector('.asset-pick')).toBeNull();
});

test('AssetPicker: cari menyaring; aset hilang tetap ditampilkan sebagai (hilang)', () => {
  mount(<AssetPicker value="project:lama.png" assets={assets} onChange={() => undefined} />);
  const trigger = host.querySelector('.asset-picker-trigger') as HTMLButtonElement;
  expect(trigger.textContent).toContain('lama.png (hilang)');
  act(() => trigger.click());
  const search = document.querySelector('.asset-picker-menu input') as HTMLInputElement;
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(search, 'todo');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect([...document.querySelectorAll('.asset-pick')].map((b) => b.textContent)).toEqual(['todoroki.png']);
});
