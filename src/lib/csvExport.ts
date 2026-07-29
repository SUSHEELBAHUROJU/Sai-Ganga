import { supabase } from './supabase'
import type { Database } from '../types/database'

type TableName = keyof Database['public']['Tables']

/** Escapes a value for a CSV cell — wraps in quotes and doubles any inner quotes. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c])).join(','))
  }
  return lines.join('\r\n')
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const PAGE_SIZE = 1000

/**
 * Fetches every row of a table/select, paginating past Supabase's
 * `max_rows` cap (1000) — a plain `.select()` would silently truncate a
 * table with years of history, which is exactly wrong for a backup export.
 */
export async function fetchAllRows(
  table: TableName,
  select: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as Record<string, unknown>[]
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}
