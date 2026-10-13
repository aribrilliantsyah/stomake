// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { homeStateFromSearch, homeStateToSearch, relativeTime, DEFAULT_HOME } from '../src/web/projects/homeState';

test('default state ↔ search kosong', () => {
  expect(homeStateFromSearch('')).toEqual(DEFAULT_HOME);
  expect(homeStateToSearch(DEFAULT_HOME)).toBe('');
});

test('roundtrip state lengkap ke URL', () => {
  const s = { q: 'selimut darurat', status: 'archived', sort: 'name', since: 7, page: 3, view: 'list' } as const;
  const qs = homeStateToSearch(s);
  expect(qs).toBe('?q=selimut+darurat&status=archived&sort=name&since=7&page=3&view=list');
  expect(homeStateFromSearch(qs)).toEqual(s);
});

test('nilai URL asing diabaikan → default', () => {
  expect(homeStateFromSearch('?status=x&sort=y&since=5&page=-2&view=z')).toEqual(DEFAULT_HOME);
});

test('relativeTime Indonesia', () => {
  const now = new Date('2026-10-13T12:00:00Z').getTime();
  expect(relativeTime('2026-10-13T11:59:40Z', now)).toBe('baru saja');
  expect(relativeTime('2026-10-13T11:15:00Z', now)).toBe('45 menit lalu');
  expect(relativeTime('2026-10-13T09:00:00Z', now)).toBe('3 jam lalu');
  expect(relativeTime('2026-10-12T10:00:00Z', now)).toBe('kemarin');
  expect(relativeTime('2026-10-08T12:00:00Z', now)).toBe('5 hari lalu');
  expect(relativeTime('2026-08-01T12:00:00Z', now)).toMatch(/2026/);
});
