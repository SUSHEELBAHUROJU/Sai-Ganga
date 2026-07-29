import { Minus, Plus } from 'lucide-react'

type NumberStepperProps = {
  label: string
  value: string
  onChange: (value: string) => void
  step?: number
  min?: number
  allowDecimal?: boolean
  placeholder?: string
  /** Tailwind classes for the +/- buttons — tint to the screen's action color. */
  accentClass?: string
}

/**
 * Big +/- stepper next to a large typed number — easier and more forgiving
 * for quick shop-floor entry than a small bare text box, while still
 * allowing direct typing for larger quantities.
 */
export function NumberStepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  allowDecimal = false,
  placeholder = '0',
  accentClass = 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
}: NumberStepperProps) {
  const round = (n: number) => (allowDecimal ? Math.round(n * 100) / 100 : Math.round(n))

  function bump(delta: number) {
    const current = Number(value || 0)
    const next = Math.max(min, round(current + delta))
    onChange(String(next))
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label="Decrease"
          onClick={() => bump(-step)}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold transition-colors ${accentClass}`}
        >
          <Minus className="h-5 w-5" strokeWidth={3} />
        </button>
        <input
          type="number"
          min={min}
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-14 min-w-0 flex-1 rounded-xl border-2 border-slate-300 text-center text-2xl font-bold text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="button"
          aria-label="Increase"
          onClick={() => bump(step)}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold transition-colors ${accentClass}`}
        >
          <Plus className="h-5 w-5" strokeWidth={3} />
        </button>
      </div>
    </label>
  )
}
