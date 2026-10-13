import { useMemo } from 'react';

export function pagerItems(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push('…');
    out.push(n);
  });
  return out;
}

export function Pager({ page, pages, total, size, go }: { page: number; pages: number; total: number; size: number; go(p: number): void }) {
  const list = useMemo(() => pagerItems(page, pages), [page, pages]);
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <nav className="pager" aria-label="Halaman">
      <span className="mono dim-text">
        {from}–{to} dari {total}
      </span>
      <span className="spacer" />
      <button disabled={page <= 1} onClick={() => go(page - 1)}>
        ‹ Sebelumnya
      </button>
      {list.map((n, i) =>
        n === '…' ? (
          <span key={`e${i}`} className="dim-text">
            …
          </span>
        ) : (
          <button key={n} className={n === page ? 'on mono' : 'mono'} onClick={() => go(n)} aria-current={n === page ? 'page' : undefined}>
            {n}
          </button>
        ),
      )}
      <button disabled={page >= pages} onClick={() => go(page + 1)}>
        Berikutnya ›
      </button>
    </nav>
  );
}
