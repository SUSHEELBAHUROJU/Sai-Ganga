import { Delete } from 'lucide-react'
import { PIN_LENGTH } from '../lib/pin'

type PinKeypadProps = {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export function PinKeypad({ value, onChange, disabled = false }: PinKeypadProps) {
  function press(digit: string) {
    if (disabled || value.length >= PIN_LENGTH) return
    onChange(value + digit)
  }

  function backspace() {
    if (disabled) return
    onChange(value.slice(0, -1))
  }

  const keyClasses =
    'flex h-16 items-center justify-center rounded-xl bg-slate-100 text-2xl font-semibold text-slate-900 transition-colors active:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-100 dark:active:bg-slate-700'

  return (
    <div className="w-full max-w-xs">
      <div className="mb-6 flex justify-center gap-3" aria-hidden>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full transition-colors ${
              i < value.length
                ? 'bg-teal-600 dark:bg-teal-400'
                : 'bg-slate-300 dark:bg-slate-700'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} disabled={disabled} className={keyClasses}>
            {k}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press('0')} disabled={disabled} className={keyClasses}>
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={disabled || value.length === 0}
          aria-label="Delete last digit"
          className={keyClasses}
        >
          <Delete className="h-6 w-6" />
        </button>
      </div>
    </div>
  )
}
