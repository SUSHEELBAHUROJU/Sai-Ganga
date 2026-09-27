import type { ExpenseCategory } from '../hooks/useExpenseCategories'
import { useExpensesForPeriod } from '../hooks/useExpenses'
import { formatMonthLabel } from './MonthRangeField'
import { Field } from './Field'
import {
  periodDays,
  resolveExpensePeriod,
  type ExpensePeriodInput,
  type ExpensePeriodType,
} from '../lib/expensePeriod'
import { formatQty } from '../lib/format'

type ExpensePeriodFieldsProps = {
  category: ExpenseCategory | undefined
  paidDate: string
  value: ExpensePeriodInput
  onChange: (next: ExpensePeriodInput) => void
  /** The expense being edited, so it isn't reported as its own duplicate. */
  editingId?: string
}

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-rose-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

/**
 * The "what is this for" half of an expense, shaped by its type: a month for
 * bills, rent and monthly salary; a start and end date for weekly salary;
 * nothing for one-time spending, which covers the day it was paid.
 */
export function ExpensePeriodFields({ category, paidDate, value, onChange, editingId }: ExpensePeriodFieldsProps) {
  const periodType = (category?.period_type ?? 'one_time') as ExpensePeriodType
  const resolved = category ? resolveExpensePeriod(periodType, paidDate, value) : null
  const period = resolved && !('error' in resolved) ? resolved : null

  // Two bills or rents for the same month is usually a double entry.
  const { data: samePeriod } = useExpensesForPeriod(
    periodType === 'month' ? (category?.id ?? null) : null,
    period?.period_start ?? null,
    period?.period_end ?? null,
  )
  const duplicates = (samePeriod ?? []).filter((e) => e.id !== editingId)

  if (!category) return null

  return (
    <div className="space-y-3">
      {periodType === 'month' && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">For Month</span>
          <input
            type="month"
            value={value.month}
            onChange={(e) => onChange({ ...value, month: e.target.value })}
            className={inputClass}
          />
        </label>
      )}

      {periodType === 'date_range' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">From</span>
            <input
              type="date"
              value={value.fromDate}
              max={value.toDate || undefined}
              onChange={(e) => onChange({ ...value, fromDate: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">To</span>
            <input
              type="date"
              value={value.toDate}
              min={value.fromDate || undefined}
              onChange={(e) => onChange({ ...value, toDate: e.target.value })}
              className={inputClass}
            />
          </label>
        </div>
      )}

      {period && periodType !== 'one_time' && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {periodType === 'month' && value.month
            ? `Counts as ${formatMonthLabel(value.month)}'s cost, whenever it was paid.`
            : `${periodDays(period.period_start, period.period_end)} days — counted in the month(s) these days fall in.`}
        </p>
      )}
      {resolved && 'error' in resolved && periodType === 'date_range' && value.fromDate && value.toDate && (
        <p className="text-xs font-semibold text-red-600 dark:text-red-400">{resolved.error}</p>
      )}

      {duplicates.length > 0 && value.month && (
        <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
          Already recorded for {formatMonthLabel(value.month)}: ₹
          {formatQty(duplicates.reduce((sum, e) => sum + e.amount, 0))} — check this isn't a second entry.
        </p>
      )}

      {category.tracks_units && (
        <Field
          label="Units consumed (optional)"
          type="number"
          min="0"
          inputMode="decimal"
          value={value.units}
          onChange={(e) => onChange({ ...value, units: e.target.value })}
          placeholder="e.g. 4200"
        />
      )}
    </div>
  )
}
