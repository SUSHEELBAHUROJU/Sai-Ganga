import { formatMonthLabel, monthBounds, monthOf } from '../components/MonthRangeField'
import { daysBetween, formatShortDate, isoDateFromDate } from './date'

/** How an expense type asks for the period it pays for — see expense_categories.period_type. */
export type ExpensePeriodType = 'one_time' | 'date_range' | 'month'

/** Form state for the period fields; only the ones the type uses matter. */
export type ExpensePeriodInput = {
  month: string
  fromDate: string
  toDate: string
  units: string
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00`)
  d.setDate(d.getDate() + days)
  return isoDateFromDate(d)
}

/** Fresh fields for a paid date: its month, and the week ending on it. */
export function initialExpensePeriod(paidDate: string): ExpensePeriodInput {
  return { month: monthOf(paidDate), fromDate: addDays(paidDate, -6), toDate: paidDate, units: '' }
}

/** Fields prefilled from a saved expense, for editing. */
export function expensePeriodFromRow(row: {
  entry_date: string
  period_start: string
  period_end: string
  units: number | null
}): ExpensePeriodInput {
  return {
    month: monthOf(row.period_start),
    fromDate: row.period_start,
    toDate: row.period_end,
    units: row.units == null ? '' : String(row.units),
  }
}

/** The period to save, or an error to show. One-time expenses cover the paid date. */
export function resolveExpensePeriod(
  periodType: ExpensePeriodType,
  paidDate: string,
  input: ExpensePeriodInput,
): { period_start: string; period_end: string } | { error: string } {
  if (periodType === 'month') {
    if (!input.month) return { error: 'Choose the month this is for' }
    const { fromDate, toDate } = monthBounds(input.month)
    return { period_start: fromDate, period_end: toDate }
  }
  if (periodType === 'date_range') {
    if (!input.fromDate || !input.toDate) return { error: 'Enter the start and end date' }
    if (input.toDate < input.fromDate) return { error: 'End date cannot be before the start date' }
    return { period_start: input.fromDate, period_end: input.toDate }
  }
  return { period_start: paidDate, period_end: paidDate }
}

/** Meter units as a number, or null when left blank. */
export function parseUnits(raw: string): number | null {
  return raw.trim() === '' ? null : Number(raw)
}

/**
 * "For August 2026" / "For 25 Aug – 31 Aug" — or null for a one-day period
 * on the paid date, which is just an ordinary expense.
 */
export function formatExpensePeriod(periodStart: string, periodEnd: string, paidDate?: string): string | null {
  if (periodStart === periodEnd && (!paidDate || periodStart === paidDate)) return null
  const month = monthOf(periodStart)
  const bounds = monthBounds(month)
  if (bounds.fromDate === periodStart && bounds.toDate === periodEnd) return `For ${formatMonthLabel(month)}`
  if (periodStart === periodEnd) return `For ${formatShortDate(periodStart)}`
  return `For ${formatShortDate(periodStart)} – ${formatShortDate(periodEnd)}`
}

/** Inclusive number of days in a period. */
export function periodDays(periodStart: string, periodEnd: string): number {
  return daysBetween(periodStart, periodEnd) + 1
}
