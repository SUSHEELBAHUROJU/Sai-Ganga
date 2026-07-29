import { X } from 'lucide-react'
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
}

export function LineItemsList({ lines, onRemove }: LineItemsListProps) {
  if (lines.length === 0) return null

  const totalPcs = lines.reduce((sum, l) => sum + l.quantity, 0)
  const totalKg = lines.reduce((sum, l) => sum + piecesToKg(l.quantity, l.weightKg), 0)

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {lines.map((line) => (
          <li
            key={line.localId}
            className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800"
          >
            <span className="font-medium text-slate-800 dark:text-slate-200">{line.label}</span>
            <div className="flex items-center gap-3">
              <AmountKgPcs kg={piecesToKg(line.quantity, line.weightKg)} pcs={line.quantity} />
              <button
                type="button"
                aria-label={`Remove ${line.label}`}
                onClick={() => onRemove(line.localId)}
                className="text-slate-400 hover:text-red-600"
              >
                <X className="h-4 w-4" />
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
