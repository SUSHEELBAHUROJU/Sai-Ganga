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
  isFutureISODate,
  FUTURE_DATE_MESSAGE,
} from '../lib/date'
import { useToast } from '../lib/toast'

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
  allLabel = 'Show All',
  hideLimitNote = false,
}: DateRangeFieldProps) {
  const today = todayISODate()
  const { showToast } = useToast()

  return (
    <div className="space-y-2">
      {isAll ? (
        // Nothing to filter by, so no greyed-out dates — just say so, with a
        // way back to picking a range.
        <div className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 sm:w-auto dark:border-slate-700 dark:bg-slate-900">
          <CalendarRange className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 text-base font-medium text-slate-900 sm:text-sm dark:text-slate-100">
            All dates
          </span>
          <button
            type="button"
            onClick={() => onChange({ fromDate, toDate })}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/60"
          >
            Pick dates
          </button>
        </div>
      ) : (
        // One line even on a 360px phone: both dates share the width equally.
        <div className="flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2.5 sm:w-auto sm:gap-2 sm:px-3 dark:border-slate-700 dark:bg-slate-900">
          <CalendarRange className="hidden h-4 w-4 shrink-0 text-slate-400 min-[400px]:block" />
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
            className="w-0 min-w-0 flex-1 bg-transparent text-base font-medium text-slate-900 outline-none sm:w-[8.5rem] sm:flex-none sm:text-sm dark:text-slate-100"
          />
          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">to</span>
          <input
            type="date"
            aria-label="To date"
            value={toDate}
            min={fromDate}
            max={today}
            onChange={(e) => {
              let next = e.target.value || toDate
              if (isFutureISODate(next)) {
                showToast(FUTURE_DATE_MESSAGE, 'error')
                next = today
              }
              const from = next < fromDate ? next : fromDate
              onChange({ fromDate: clampRangeStart(from, next), toDate: next })
            }}
            className="w-0 min-w-0 flex-1 bg-transparent text-base font-medium text-slate-900 outline-none sm:w-[8.5rem] sm:flex-none sm:text-sm dark:text-slate-100"
          />
        </div>
      )}
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
