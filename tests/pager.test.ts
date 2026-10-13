import { expect, test } from 'vitest';
import { pagerItems } from '../src/web/projects/Pager';

test('pagerItems: ≤7 halaman tampil semua', () => {
  expect(pagerItems(1, 1)).toEqual([1]);
  expect(pagerItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test('pagerItems: elipsis di sekitar halaman aktif', () => {
  expect(pagerItems(1, 20)).toEqual([1, 2, '…', 20]);
  expect(pagerItems(10, 20)).toEqual([1, '…', 9, 10, 11, '…', 20]);
  expect(pagerItems(20, 20)).toEqual([1, '…', 19, 20]);
  expect(pagerItems(3, 20)).toEqual([1, 2, 3, 4, '…', 20]);
});
