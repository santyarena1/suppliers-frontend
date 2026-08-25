"use client";

import { useEffect, useState } from "react";
import {
  currentMonthKey,
  filterByMonth,
  paginateRows,
  type MonthFilter,
} from "@/lib/account-history";

/**
 * Estado compartido de sección + mes + página. Al cambiar mes/sección vuelve a pág. 1.
 */
export function useAccountHistoryState(defaultSection: string) {
  const [section, setSection] = useState(defaultSection);
  const [month, setMonth] = useState<MonthFilter>(currentMonthKey());
  const [page, setPage] = useState(1);

  function changeSection(id: string) {
    setSection(id);
    setPage(1);
  }

  function changeMonth(m: MonthFilter) {
    setMonth(m);
    setPage(1);
  }

  return {
    section,
    setSection: changeSection,
    month,
    setMonth: changeMonth,
    page,
    setPage,
  };
}

export function usePagedMonthRows<T>(
  rows: T[] | null | undefined,
  getDate: (row: T) => string | null | undefined,
  month: MonthFilter,
  page: number
) {
  const filtered = filterByMonth(rows ?? [], getDate, month);
  return { ...paginateRows(filtered, page), filtered };
}

/** Resetea página si el total de páginas baja (p. ej. al filtrar). */
export function useClampPage(page: number, pages: number, setPage: (p: number) => void) {
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages, setPage]);
}
