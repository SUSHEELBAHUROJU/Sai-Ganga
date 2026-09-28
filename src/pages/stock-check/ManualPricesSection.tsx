import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { SaveButton } from '../../components/SaveButton'
import { LoadingState } from '../../components/States'
import {
  useManualRates,
  useSaveManualRates,
  manualCostSummary,
  costPerKgProduced,
  type ManualRates,
  type StockCheckPeriod,
} from '../../hooks/useStockChecks'
import { useToast } from '../../lib/toast'
import { formatQty } from '../../lib/format'

/**
 * "Calculate with your prices": the owner types a price per kg for the
 * materials used this week and sees the total and cost per kg with those
 * prices, next to the app's own figure. Blank prices keep the app's rate.
 */
export function ManualPricesSection({ period }: { period: StockCheckPeriod }) {
  const { data: saved, isLoading } = useManualRates(period.count_id)
  const [open, setOpen] = useState(false)

  const savedCostPerKg = saved && saved.size > 0 ? manualCostSummary(period, saved).costPerKg : null

  return (
    <div className="rounded-lg border border-slate-200/70 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Calculate with your prices</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {savedCostPerKg !== null
              ? `Your prices: ₹${formatQty(savedCostPerKg)}/kg pipe`
              : 'Enter your own ₹/kg for the materials used'}
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
        )}
      </button>

      {open &&
        (isLoading || !saved ? (
          <LoadingState />
        ) : (
          // Seeded once from the saved prices; a background refetch won't wipe typing.
          <ManualPricesForm period={period} saved={saved} />
        ))}
    </div>
  )
}

function ManualPricesForm({ period, saved }: { period: StockCheckPeriod; saved: ManualRates }) {
  const saveRates = useSaveManualRates()
  const { showToast } = useToast()
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries([...saved].map(([id, rate]) => [id, String(rate)])),
  )

  const rates = useMemo(() => {
    const map: ManualRates = new Map()
    for (const [id, value] of Object.entries(inputs)) {
      const n = Number(value)
      if (value.trim() !== '' && Number.isFinite(n) && n >= 0) map.set(id, n)
    }
    return map
  }, [inputs])

  const { lines, usedKg, materialCost, costPerKg } = manualCostSummary(period, rates)
  const appCostPerKg = costPerKgProduced(period)
  // Only the materials shown can be saved — a price typed for one that's no
  // longer used this week would just sit there.
  const shownRates: ManualRates = new Map(
    lines.filter((l) => l.manualRate !== null).map((l) => [l.material.raw_material_type_id, l.manualRate as number]),
  )
  const dirty =
    shownRates.size !== saved.size || [...shownRates].some(([id, rate]) => saved.get(id) !== rate)

  function handleSave() {
    saveRates.mutate(
      { countId: period.count_id, rates: shownRates },
      {
        onSuccess: () => showToast('Your prices saved'),
        onError: () => showToast('Could not save prices', 'error'),
      },
    )
  }

  if (lines.length === 0) {
    return (
      <p className="border-t border-slate-200/70 px-3 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        No material was used in this period.
      </p>
    )
  }

  return (
    <div className="space-y-3 border-t border-slate-200/70 px-3 py-3 dark:border-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Type a price per kg for any material. Left blank, the app's rate is used. Only materials used this week (more
        than 0 kg) are counted.
      </p>

      <div className="space-y-2">
        {lines.map((line) => {
          const id = line.material.raw_material_type_id
          return (
            <div key={id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {line.material.material_name}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {formatQty(line.material.consumed_kg)} kg · app ₹{formatQty(line.appRate)}/kg
                </p>
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                  ₹{formatQty(line.cost)}
                  {line.manualRate === null && (
                    <span className="font-normal text-slate-400 dark:text-slate-500"> (app rate)</span>
                  )}
                </p>
              </div>
              <label className="flex w-28 shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-2 focus-within:border-purple-500 dark:border-slate-700 dark:bg-slate-800">
                <span className="text-sm text-slate-400">₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  aria-label={`${line.material.material_name} price per kg`}
                  placeholder={formatQty(line.appRate)}
                  value={inputs[id] ?? ''}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                  className="w-full min-w-0 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                />
              </label>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-purple-50 px-3 py-2 text-sm font-bold text-purple-800 dark:bg-purple-950/40 dark:text-purple-200">
        <span>Material · {formatQty(usedKg)} kg</span>
        <span className="font-mono">₹{formatQty(materialCost)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            App calculation
          </p>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {appCostPerKg === null ? '—' : `₹${formatQty(appCostPerKg)}/kg`}
          </p>
        </div>
        <div className="rounded-lg bg-purple-50 px-3 py-2 dark:bg-purple-950/40">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">
            Your prices
          </p>
          <p className="text-sm font-bold text-purple-800 dark:text-purple-200">
            {costPerKg === null ? '—' : `₹${formatQty(costPerKg)}/kg`}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Cost per kg = (material ₹{formatQty(materialCost)} + running costs ₹{formatQty(period.overhead_cost)}) ÷{' '}
        {formatQty(period.produced_kg)} kg pipe. Running costs are the same as the app's.
      </p>

      <SaveButton
        accent="stock"
        onClick={handleSave}
        disabled={!dirty}
        pending={saveRates.isPending}
        label={saved.size > 0 ? 'Update My Prices' : 'Save My Prices'}
      />
    </div>
  )
}
