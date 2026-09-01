import { formatQty } from '../lib/format'

/**
 * The money side of a purchase, entirely derived: the rate the owner entered
 * times the weight, plus transport. Shared by the raw-material and scrap forms
 * (and their edit forms) so the arithmetic is shown the same way everywhere and
 * nobody has to check whether a total already includes freight.
 */
export function PurchaseCostSummary({
  pricePerKg,
  quantityKg,
  materialCost,
  transport,
}: {
  pricePerKg: number
  quantityKg: number
  materialCost: number
  transport: number
}) {
  if (materialCost <= 0 && transport <= 0) return null

  return (
    <div className="space-y-2 rounded-xl bg-orange-50 px-4 py-3 dark:bg-orange-950/30">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-orange-700/80 dark:text-orange-400/80">
          ₹{formatQty(pricePerKg)}/kg × {formatQty(quantityKg)} kg
        </span>
        <span className="font-semibold text-orange-700 tabular-nums dark:text-orange-400">
          ₹{formatQty(materialCost)}
        </span>
      </div>

      {transport > 0 && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-orange-700/80 dark:text-orange-400/80">
            Transport charges
          </span>
          <span className="font-semibold text-orange-700 tabular-nums dark:text-orange-400">
            ₹{formatQty(transport)}
          </span>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 border-t border-orange-200 pt-2 dark:border-orange-900/60">
        <span className="text-xs font-medium text-orange-700 dark:text-orange-400">
          Total Purchase Cost
        </span>
        <span className="text-lg font-bold text-orange-700 tabular-nums dark:text-orange-400">
          ₹{formatQty(materialCost + transport)}
        </span>
      </div>
    </div>
  )
}
