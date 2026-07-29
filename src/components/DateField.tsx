import { CalendarDays } from 'lucide-react'
import { formatDateLabel, todayISODate } from '../lib/date'

type DateFieldProps = {
  value: string
  onChange: (value: string) => void
}

export function DateField({ value, onChange }: DateFieldProps) {
  return (
    <label className="flex w-fit items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
      <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        type="date"
        value={value}
        max={todayISODate()}
        onChange={(e) => onChange(e.target.value || todayISODate())}
        className="w-[9.5rem] bg-transparent text-sm font-medium text-slate-900 outline-none dark:text-slate-100"
      />
      <span className="shrink-0 text-xs font-medium text-teal-600 dark:text-teal-400">
        {formatDateLabel(value)}
      </span>
    </label>
  )
}
