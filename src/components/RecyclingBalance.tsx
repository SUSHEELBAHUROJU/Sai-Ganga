import { ArrowRight } from 'lucide-react'
import { formatQty } from '../lib/format'

/**
 * Scrap consumed and granules produced are independently entered — recycling
 * always loses some material. This shows both side by side with the gap.
 *
 * A negative gap (produced > consumed) is physically impossible and means a
 * typo, so it's surfaced plainly rather than blocked: the user decides.
 */
export function recyclingWasteKg(consumedKg: number, producedKg: number): number {
  return consumedKg - producedKg
}

type RecyclingBalanceProps = {
  consumedKg: number
  producedKg: number
  /** `compact` is the inline one-line form used in lists. */
  variant?: 'panel' | 'compact'
}

export function RecyclingBalance({
  consumedKg,
  producedKg,
  variant = 'panel',
}: RecyclingBalanceProps) {
  const waste = recyclingWasteKg(consumedKg, producedKg)
  const overproduced = waste < 0

  const wasteLabel = overproduced ? 'Over by' : 'Waste/Shortage'

  if (variant === 'compact') {
    return (
      <span>
        Consumed {formatQty(consumedKg)}kg → Produced {formatQty(producedKg)}kg →{' '}
        <span className={overproduced ? 'text-amber-700 dark:text-amber-400' : undefined}>
          {wasteLabel} {formatQty(Math.abs(waste))}kg
        </span>
      </span>
    )
  }

  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Scrap Consumed</p>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {formatQty(consumedKg)} kg
          </p>
        </div>

        <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />

        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Granules Produced</p>
          <p className="text-base font-semibold text-teal-700 dark:text-teal-300">
            {formatQty(producedKg)} kg
          </p>
        </div>

        <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />

        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{wasteLabel}</p>
          <p
            className={`text-base font-semibold ${
              overproduced
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatQty(Math.abs(waste))} kg
          </p>
        </div>
      </div>

      {overproduced && (
        <p className="mt-2 text-center text-xs text-amber-700 dark:text-amber-400">
          Granules produced is more than scrap consumed — worth double-checking.
        </p>
      )}
    </div>
  )
}
