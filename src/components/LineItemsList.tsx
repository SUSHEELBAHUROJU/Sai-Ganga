import { X, Minus, Plus } from 'lucide-react'
import { AmountKgPcs } from './AmountKgPcs'
import { piecesToKg } from '../lib/format'

export type LineItem = {
  localId: string
  label: string
  quantity: number
  weightKg: number
}

type LineItemsListProps = {
  lines: LineItem[]
  onRemove: (localId: string) => void
  onUpdateQuantity?: (localId: string, newQuantity: number) => void
}

export function LineItemsList({ lines, onRemove, onUpdateQuantity }: LineItemsListProps) {
  if (lines.length === 0) return null

  const totalPcs = lines.reduce((sum, l) => sum + l.quantity, 0)
  const totalKg = lines.reduce((sum, l) => sum + piecesToKg(l.quantity, l.weightKg), 0)

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {lines.map((line) => (
          <li
            key={line.localId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                {line.label}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
              {/* Stepper if onUpdateQuantity provided */}
              {onUpdateQuantity ? (
                <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
                  <button
                    type="button"
                    aria-label={`One less ${line.label}`}
                    onClick={() => onUpdateQuantity(line.localId, Math.max(1, line.quantity - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    aria-label={`Quantity of ${line.label}`}
                    value={line.quantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1
                      onUpdateQuantity(line.localId, Math.max(1, val))
                    }}
                    className="w-12 bg-transparent text-center font-mono text-sm font-bold text-slate-900 outline-none dark:text-slate-100"
                  />
                  <button
                    type="button"
                    aria-label={`One more ${line.label}`}
                    onClick={() => onUpdateQuantity(line.localId, line.quantity + 1)}
                    className="flex h-10 w-10 items-center justify-center rounded text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <span className="pr-1 text-xs text-slate-400">pcs</span>
                </div>
              ) : null}

              <AmountKgPcs kg={piecesToKg(line.quantity, line.weightKg)} pcs={line.quantity} />

              <button
                type="button"
                aria-label={`Remove ${line.label}`}
                onClick={() => onRemove(line.localId)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-right text-xs font-medium text-slate-500 dark:text-slate-400">
        {lines.length} line{lines.length === 1 ? '' : 's'} ·{' '}
        <AmountKgPcs kg={totalKg} pcs={totalPcs} /> total
      </p>
    </div>
  )
}

