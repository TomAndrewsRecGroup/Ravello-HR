'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  totalItems?: number;
}

export default function Pagination({ page, totalPages, onPageChange, pageSize, totalItems }: Props) {
  if (totalPages <= 1) return null;

  const start = pageSize ? (page - 1) * pageSize + 1 : null;
  const end = pageSize && totalItems ? Math.min(page * pageSize, totalItems) : null;

  return (
    <div className="flex items-center justify-between pt-4">
      <div className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
        {start != null && end != null && totalItems != null
          ? `${start}–${end} of ${totalItems}`
          : `Page ${page} of ${totalPages}`}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="btn-icon"
          style={{ width: 28, height: 28, opacity: page <= 1 ? 0.3 : 1 }}
        >
          <ChevronLeft size={14} />
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let pageNum: number;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (page <= 3) {
            pageNum = i + 1;
          } else if (page >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = page - 2 + i;
          }
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className="w-7 h-7 rounded-md text-xs font-medium transition-colors"
              style={{
                background: page === pageNum ? 'var(--purple)' : 'transparent',
                color: page === pageNum ? '#fff' : 'var(--ink-soft)',
              }}
            >
              {pageNum}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="btn-icon"
          style={{ width: 28, height: 28, opacity: page >= totalPages ? 0.3 : 1 }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * Hook for client-side pagination.
 * Usage:
 *   const { paged, page, totalPages, setPage } = usePagination(items, 20);
 */
export function usePagination<T>(items: T[], pageSize: number = 20) {
  const { useState } = require('react');
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { paged, page: safePage, totalPages, setPage, totalItems: items.length, pageSize };
}
