"use client";

import Icon from "../Icon";

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pageCount, start + 4);
  for (let p = Math.max(1, end - 4); p <= end; p++) pages.push(p);

  return (
    <div className="pagination">
      <span className="pg-info">
        {from}–{to} of {total}
      </span>
      <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <Icon name="chevron_left" />
      </button>
      {pages.map((p) => (
        <button key={p} type="button" className={p === page ? "is-active" : undefined} onClick={() => onPageChange(p)}>
          {p}
        </button>
      ))}
      <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        <Icon name="chevron_right" />
      </button>
    </div>
  );
}
