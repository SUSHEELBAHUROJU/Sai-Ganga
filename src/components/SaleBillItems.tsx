import { useEffect, useRef } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import { formatQty, piecesToKg } from '../lib/format'

export type SaleLine = {
  localId: string
  pipeProductId: string
  label: string
  quantity: number
  /** Per-piece weight of the pipe. */
  weightKg: number
  /** Selling rate as typed — a string so the field can be empty until entered. */
  rate: string
}

export function lineAmount(line: SaleLine): number {
  const kg = piecesToKg(line.quantity, line.weightKg)
  return Math.round(kg * (Number(line.rate) || 0) * 100) / 100
}

type SaleBillItemsProps = {
  lines: SaleLine[]
  /** The line just added — its rate field takes focus so the price is asked for right away. */
  focusLineId: string | null
  onChange: (localId: string, patch: Partial<Pick<SaleLine, 'quantity' | 'rate'>>) => void
  onRemove: (localId: string) => void
}

const rupees = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The Sale screen's bill lines: pcs, weight, and the selling rate for each. */
export function SaleBillItems({ lines, focusLineId, onChange, onRemove }: SaleBillItemsProps) {
  const rateRefs = useRef(new Map<string, HTMLInputElement>())

  useEffect(() => {
    if (!focusLineId) return
    const input = rateRefs.current.get(focusLineId)
    if (!input) return
    input.focus()
    // Pre-filled with the previous line's rate: selected so typing replaces it.
    input.select()
    input.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusLineId])

  if (lines.length === 0) return null

  return (
    <ul className="space-y-2">
      {lines.map((line, idx) => {
        const kg = piecesToKg(line.quantity, line.weightKg)
        const missingRate = !(Number(line.rate) > 0)
        return (
          <li
            key={line.localId}
            className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                <span className="mr-1.5 text-xs font-bold text-slate-400">{idx + 1}.</span>
                {line.label}
              </span>
              <button
                type="button"
                aria-label={`Remove ${line.label}`}
                onClick={() => onRemove(line.localId)}
                className="-my-1 -mr-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  aria-label={`One less ${line.label}`}
                  onClick={() => onChange(line.localId, { quantity: Math.max(1, line.quantity - 1) })}
                  className="flex h-10 w-10 items-center justify-center rounded text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  aria-label={`Pieces of ${line.label}`}
                  value={line.quantity}
                  onChange={(e) => onChange(line.localId, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-14 bg-transparent text-center font-mono text-base font-bold text-slate-900 outline-none dark:text-slate-100"
                />
                <button
                  type="button"
                  aria-label={`One more ${line.label}`}
                  onClick={() => onChange(line.localId, { quantity: line.quantity + 1 })}
                  className="flex h-10 w-10 items-center justify-center rounded text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <span className="pr-1 text-xs text-slate-400">pcs</span>
              </div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatQty(kg)} kg</span>
            </div>

            <div className="flex items-end justify-between gap-3">
              <label className="block min-w-0 flex-1">
                <span
                  className={`mb-0.5 block text-xs font-medium ${missingRate ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {missingRate ? 'Enter rate ₹/kg' : 'Rate ₹/kg'}
                </span>
                <input
                  ref={(el) => {
                    if (el) rateRefs.current.set(line.localId, el)
                    else rateRefs.current.delete(line.localId)
                  }}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={line.rate}
                  onChange={(e) => onChange(line.localId, { rate: e.target.value })}
                  placeholder="e.g. 95"
                  className={`min-h-[44px] w-full rounded-lg border px-3 py-2 font-mono text-base font-bold text-slate-900 outline-none focus:ring-1 dark:bg-slate-800 dark:text-slate-100 ${
                    missingRate
                      ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500 dark:border-amber-600'
                      : 'border-slate-300 focus:border-teal-500 focus:ring-teal-500 dark:border-slate-700'
                  }`}
                />
              </label>
              <div className="shrink-0 pb-2 text-right">
                <span className="block text-xs text-slate-500 dark:text-slate-400">Amount</span>
                <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                  ₹{rupees(lineAmount(line))}
                </span>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
