// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { undoRedoAction } from '../src/web/editor/shortcuts';

const key = (k: string, mods: Partial<KeyboardEventInit> = {}, target?: HTMLElement) => {
  const e = new KeyboardEvent('keydown', { key: k, ...mods });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return e;
};
const el = (tag: string, cls = '') => {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  return x;
};

test('Ctrl+Z → undo, Ctrl+Shift+Z / Ctrl+Y → redo', () => {
  expect(undoRedoAction(key('z', { ctrlKey: true }))).toBe('undo');
  expect(undoRedoAction(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
  expect(undoRedoAction(key('y', { ctrlKey: true }))).toBe('redo');
  expect(undoRedoAction(key('z', { metaKey: true }))).toBe('undo');
  expect(undoRedoAction(key('z'))).toBeNull();
  expect(undoRedoAction(key('c', { ctrlKey: true }))).toBeNull();
});

test('di textarea subtitle/catatan & input properti → tetap undo aplikasi', () => {
  expect(undoRedoAction(key('z', { ctrlKey: true }, el('textarea')))).toBe('undo');
  expect(undoRedoAction(key('y', { ctrlKey: true }, el('input')))).toBe('redo');
});

test('di textarea storyline & kolom cari → undo bawaan browser (null)', () => {
  expect(undoRedoAction(key('z', { ctrlKey: true }, el('textarea', 'storyline-text')))).toBeNull();
  const search = el('input');
  search.setAttribute('data-native-undo', '');
  expect(undoRedoAction(key('z', { ctrlKey: true }, search))).toBeNull();
});
