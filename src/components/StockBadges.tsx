import { AlertTriangle, HelpCircle } from 'lucide-react'
import { formatQty } from '../lib/format'

/** Shared stock-display primitives — used by Reports > Stock and the Dashboard's live stock summary, so the two never drift apart. */

export function LowStockBadge({ threshold }: { threshold: number | null }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-400">
      <AlertTriangle className="h-3 w-3" />
      Low{threshold !== null ? ` (< ${formatQty(threshold)})` : ''}
    </span>
  )
}

/**
 * Negative stock is arithmetically correct but physically impossible — it
 * means more was sold/consumed than was ever recorded as produced/bought. Call
 * it out so it reads as "check your entries", not as a real balance.
 */
export function CheckEntriesBadge() {
  return (
    <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-400">
      <HelpCircle className="h-3 w-3" />
      Check entries
    </span>
  )
}

export function StockValue({ value, unit }: { value: number; unit: string }) {
  return (
    <span
      className={`text-sm font-semibold ${
        value < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
      }`}
    >
      {formatQty(value)} {unit}
    </span>
  )
}

/**
 * Finished-goods stock is kept per piece in the DB but the business measures
 * it in weight — kg is the primary figure here, pcs a smaller secondary note,
 * matching production/sales displays everywhere else in the app.
 */
export function StockValueKgPcs({ kg, pcs }: { kg: number; pcs: number }) {
  const negative = kg < 0
  return (
    <span
      className={`text-sm font-semibold ${
        negative ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
      }`}
    >
      {formatQty(kg)} kg{' '}
      <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
        ({formatQty(pcs)} pcs)
      </span>
    </span>
  )
}

/** Low-stock badge, or the negative-balance warning when that takes priority. */
export function StockFlag({
  isNegative,
  isLow,
  threshold,
}: {
  isNegative: boolean
  isLow: boolean
  threshold: number | null
}) {
  if (isNegative) return <CheckEntriesBadge />
  if (isLow) return <LowStockBadge threshold={threshold} />
  return null
}

/**
 * Color says it before the text does: green = healthy, amber = getting low,
 * red = below threshold/critical — a left border strip on every stock row so
 * status reads at a glance, without needing to read the number.
 */
export function stockHealthBorderClass(isNegative: boolean, isLow: boolean): string {
  if (isNegative) return 'border-l-red-500'
  if (isLow) return 'border-l-amber-500'
  return 'border-l-green-500'
}
