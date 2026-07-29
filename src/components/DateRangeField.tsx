import { CalendarRange } from 'lucide-react'
import { Chip } from './Chip'
import { todayISODate, isoDateDaysAgo, startOfWeek, startOfMonth } from '../lib/date'

type DateRangeFieldProps = {
  fromDate: string
  toDate: string
  onChange: (range: { fromDate: string; toDate: string }) => void
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

export function DateRangeField({ fromDate, toDate, onChange }: DateRangeFieldProps) {
  const today = todayISODate()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
          <CalendarRange className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => {
              const next = e.target.value || fromDate
              onChange({ fromDate: next, toDate: next > toDate ? next : toDate })
            }}
            className="w-[8.5rem] bg-transparent text-sm font-medium text-slate-900 outline-none dark:text-slate-100"
          />
          <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            max={today}
            onChange={(e) => {
              const next = e.target.value || toDate
              onChange({ fromDate: next < fromDate ? next : fromDate, toDate: next })
            }}
            className="w-[8.5rem] bg-transparent text-sm font-medium text-slate-900 outline-none dark:text-slate-100"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {SHORTCUTS.map((s) => {
          const range = s.range()
          const active = range.fromDate === fromDate && range.toDate === toDate
          return (
            <Chip key={s.label} label={s.label} selected={active} onClick={() => onChange(range)} />
          )
        })}
      </div>
    </div>
  )
}
