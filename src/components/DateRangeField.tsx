import { CalendarRange } from 'lucide-react'
import { Chip } from './Chip'
import {
  todayISODate,
  isoDateDaysAgo,
  startOfWeek,
  startOfMonth,
  clampRangeEnd,
  clampRangeStart,
  MAX_QUERY_RANGE_DAYS,
} from '../lib/date'

type DateRangeFieldProps = {
  fromDate: string
  toDate: string
  onChange: (range: { fromDate: string; toDate: string }) => void
  showAllOption?: boolean
  isAll?: boolean
  onSelectAll?: () => void
  allLabel?: string
  hideLimitNote?: boolean
}

const SHORTCUTS: { label: string; range: () => { fromDate: string; toDate: string } }[] = [
  { label: 'Today', range: () => ({ fromDate: todayISODate(), toDate: todayISODate() }) },
  { label: 'This Week', range: () => ({ fromDate: startOfWeek(), toDate: todayISODate() }) },
  { label: 'This Month', range: () => ({ fromDate: startOfMonth(), toDate: todayISODate() }) },
  {
    label: 'Last 30 Days',
    range: () => ({ fromDate: isoDateDaysAgo(29), toDate: todayISODate() }),
  },
]

export function DateRangeField({
  fromDate,
  toDate,
  onChange,
  showAllOption = false,
  isAll = false,
  onSelectAll,
  allLabel = 'Pull All',
  hideLimitNote = false,
}: DateRangeFieldProps) {
  const today = todayISODate()

  return (
    <div className="space-y-2">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 sm:w-auto dark:border-slate-700 dark:bg-slate-900">
        <CalendarRange className={`h-4 w-4 shrink-0 ${isAll ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`} />
        <input
          type="date"
          aria-label="From date"
          value={fromDate}
          max={toDate}
          onChange={(e) => {
            const next = e.target.value || fromDate
            const to = next > toDate ? next : toDate
            onChange({ fromDate: next, toDate: clampRangeEnd(next, to) })
          }}
          className={`min-w-0 flex-1 basis-28 bg-transparent text-sm font-medium outline-none sm:w-[8.5rem] sm:flex-none sm:basis-auto ${
            isAll ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'
          }`}
        />
        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">to</span>
        <input
          type="date"
          aria-label="To date"
          value={toDate}
          min={fromDate}
          max={today}
          onChange={(e) => {
            const next = e.target.value || toDate
            const from = next < fromDate ? next : fromDate
            onChange({ fromDate: clampRangeStart(from, next), toDate: next })
          }}
          className={`min-w-0 flex-1 basis-28 bg-transparent text-sm font-medium outline-none sm:w-[8.5rem] sm:flex-none sm:basis-auto ${
            isAll ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'
          }`}
        />
        {isAll && (
          <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
            All Records
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {showAllOption && (
          <Chip
            label={allLabel}
            selected={isAll}
            onClick={() => onSelectAll?.()}
          />
        )}
        {SHORTCUTS.map((s) => {
          const range = s.range()
          const active = !isAll && range.fromDate === fromDate && range.toDate === toDate
          return (
            <Chip key={s.label} label={s.label} selected={active} onClick={() => onChange(range)} />
          )
        })}
      </div>
      {!hideLimitNote && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Ranges are limited to {MAX_QUERY_RANGE_DAYS} days at a time.
        </p>
      )}
    </div>
  )
}
