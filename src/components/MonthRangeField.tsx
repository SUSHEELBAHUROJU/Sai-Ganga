import { Chip } from './Chip'
import { clampRangeEnd, clampRangeStart, MAX_QUERY_RANGE_DAYS } from '../lib/date'

export type ReportPeriod = {
  fromDate: string
  toDate: string
  /** Present when the range came from the month picker — lets the report
   *  title read "August 2026" instead of a from–to range. */
  month: string | null
}

type MonthRangeFieldProps = {
  value: ReportPeriod
  onChange: (period: ReportPeriod) => void
}

/** First and last day of a "YYYY-MM" month, inclusive — computed with day 0
 *  of the next month so month lengths and leap years take care of themselves. */
export function monthBounds(month: string): { fromDate: string; toDate: string } {
  const [year, mon] = month.split('-').map(Number)
  const last = new Date(year, mon, 0).getDate()
  return {
    fromDate: `${month}-01`,
    toDate: `${month}-${String(last).padStart(2, '0')}`,
  }
}

export function monthOf(dateISO: string): string {
  return dateISO.slice(0, 7)
}

/** e.g. "August 2026" */
export function formatMonthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return new Date(year, mon - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Month-or-custom-range picker for the two downloadable reports. Separate
 * from DateRangeField on purpose: that one is shared live state across the
 * Summary/Trend/Dues tabs, and these reports each need their own period —
 * plus picking an arbitrary past month, which DateRangeField can't do.
 */
export function MonthRangeField({ value, onChange }: MonthRangeFieldProps) {
  const isMonthMode = value.month !== null

  function selectMonth(month: string) {
    if (!month) return
    onChange({ ...monthBounds(month), month })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Chip
          label="By Month"
          selected={isMonthMode}
          onClick={() => selectMonth(value.month ?? monthOf(value.toDate))}
        />
        <Chip
          label="Custom Dates"
          selected={!isMonthMode}
          onClick={() => onChange({ ...value, month: null })}
        />
      </div>

      {isMonthMode ? (
        <label className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 sm:w-auto dark:border-slate-700 dark:bg-slate-900">
          <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
            Month
          </span>
          <input
            type="month"
            value={value.month ?? ''}
            onChange={(e) => selectMonth(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none dark:text-slate-100"
          />
        </label>
      ) : (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 sm:w-auto dark:border-slate-700 dark:bg-slate-900">
          <input
            type="date"
            aria-label="From date"
            value={value.fromDate}
            max={value.toDate}
            onChange={(e) => {
              const next = e.target.value || value.fromDate
              const to = next > value.toDate ? next : value.toDate
              onChange({ fromDate: next, toDate: clampRangeEnd(next, to), month: null })
            }}
            className="min-w-0 flex-1 basis-28 bg-transparent text-sm font-medium text-slate-900 outline-none sm:w-[8.5rem] sm:flex-none sm:basis-auto dark:text-slate-100"
          />
          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">to</span>
          <input
            type="date"
            aria-label="To date"
            value={value.toDate}
            min={value.fromDate}
            onChange={(e) => {
              const next = e.target.value || value.toDate
              const from = next < value.fromDate ? next : value.fromDate
              onChange({ fromDate: clampRangeStart(from, next), toDate: next, month: null })
            }}
            className="min-w-0 flex-1 basis-28 bg-transparent text-sm font-medium text-slate-900 outline-none sm:w-[8.5rem] sm:flex-none sm:basis-auto dark:text-slate-100"
          />
        </div>
      )}

      {!isMonthMode && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Ranges are limited to {MAX_QUERY_RANGE_DAYS} days at a time.
        </p>
      )}
    </div>
  )
}

/** Default period: the current calendar month. */
export function currentMonthPeriod(today: string): ReportPeriod {
  const month = monthOf(today)
  return { ...monthBounds(month), month }
}
