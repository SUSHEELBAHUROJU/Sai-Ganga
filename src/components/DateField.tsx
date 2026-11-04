import { CalendarDays } from 'lucide-react'
import { formatDateLabel, isFutureISODate, todayISODate, FUTURE_DATE_MESSAGE } from '../lib/date'
import { useToast } from '../lib/toast'

type DateFieldProps = {
  value: string
  onChange: (value: string) => void
}

/**
 * Fluid on purpose: a fixed-width date input plus the "Today" label was wider
 * than a 320px phone once a page title sat beside it, pushing the whole screen
 * sideways. Full-width on a phone (also a bigger tap target), auto-width from
 * `sm` up so it still sits neatly at the end of a header row.
 */
export function DateField({ value, onChange }: DateFieldProps) {
  const { showToast } = useToast()
  return (
    <label className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 sm:w-auto dark:border-slate-700 dark:bg-slate-900">
      <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        type="date"
        value={value}
        max={todayISODate()}
        onChange={(e) => {
          // `max` keeps the picker in range, but a date can still be typed
          // straight into the field, so put a future entry back to today —
          // and say so, rather than changing it without a word.
          const next = e.target.value
          if (next && isFutureISODate(next)) showToast(FUTURE_DATE_MESSAGE, 'error')
          onChange(!next || isFutureISODate(next) ? todayISODate() : next)
        }}
        className="min-w-0 flex-1 bg-transparent text-base sm:text-sm font-medium text-slate-900 outline-none sm:w-[9.5rem] sm:flex-none dark:text-slate-100"
      />
      <span className="shrink-0 text-xs font-medium text-teal-600 dark:text-teal-400">
        {formatDateLabel(value)}
      </span>
    </label>
  )
}
