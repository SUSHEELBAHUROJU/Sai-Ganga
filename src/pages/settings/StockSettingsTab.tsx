import { useState } from 'react'
import { Check } from 'lucide-react'
import { usePipeProducts } from '../../hooks/usePipeProducts'
import { useRawMaterialTypes } from '../../hooks/useRawMaterialTypes'
import { useScrapTypes } from '../../hooks/useScrapTypes'
import {
  useOpeningBalances,
  useLowStockThresholds,
  useUpsertOpeningBalance,
  useUpsertLowStockThreshold,
  useDeleteOpeningBalance,
  useDeleteLowStockThreshold,
  type ItemType,
} from '../../hooks/useStockSettings'
import { useToast } from '../../lib/toast'
import { formatPipeProductLabel } from '../../lib/format'
import { LoadingState } from '../../components/States'

type StockRowProps = {
  itemType: ItemType
  itemId: string
  label: string
  unit: 'pcs' | 'kg'
  initialBalance: number | null
  initialThreshold: number | null
}

function StockRow({ itemType, itemId, label, unit, initialBalance, initialThreshold }: StockRowProps) {
  const [balance, setBalance] = useState(initialBalance === null ? '' : String(initialBalance))
  const [threshold, setThreshold] = useState(initialThreshold === null ? '' : String(initialThreshold))
  const upsertBalance = useUpsertOpeningBalance()
  const upsertThreshold = useUpsertLowStockThreshold()
  const deleteBalance = useDeleteOpeningBalance()
  const deleteThreshold = useDeleteLowStockThreshold()
  const { showToast } = useToast()

  const dirty =
    balance !== (initialBalance === null ? '' : String(initialBalance)) ||
    threshold !== (initialThreshold === null ? '' : String(initialThreshold))

  const saving =
    upsertBalance.isPending || upsertThreshold.isPending || deleteBalance.isPending || deleteThreshold.isPending

  async function handleSave() {
    try {
      if (balance.trim() === '') {
        if (initialBalance !== null) await deleteBalance.mutateAsync({ item_type: itemType, item_id: itemId })
      } else {
        await upsertBalance.mutateAsync({
          item_type: itemType,
          item_id: itemId,
          quantity: Number(balance),
          unit,
        })
      }

      if (threshold.trim() === '') {
        if (initialThreshold !== null)
          await deleteThreshold.mutateAsync({ item_type: itemType, item_id: itemId })
      } else {
        await upsertThreshold.mutateAsync({
          item_type: itemType,
          item_id: itemId,
          min_quantity: Number(threshold),
        })
      }

      showToast(`Saved ${label}`)
    } catch {
      showToast('Could not save', 'error')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800">
      <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-slate-100">{label}</span>

      <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        Opening ({unit})
        <input
          type="number"
          min="0"
          inputMode="decimal"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="0"
          className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        Low-stock at
        <input
          type="number"
          min="0"
          inputMode="decimal"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          placeholder="Off"
          className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>

      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty || saving}
        aria-label={`Save ${label}`}
        className={`rounded-full p-2 ${
          dirty
            ? 'bg-teal-600 text-white hover:bg-teal-700'
            : 'bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600'
        }`}
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  )
}

export function StockSettingsTab() {
  const { data: pipeProducts, isLoading: loadingPipes } = usePipeProducts()
  const { data: materialTypes, isLoading: loadingMaterials } = useRawMaterialTypes()
  const { data: scrapTypes, isLoading: loadingScrapTypes } = useScrapTypes()
  const { data: balances, isLoading: loadingBalances } = useOpeningBalances()
  const { data: thresholds, isLoading: loadingThresholds } = useLowStockThresholds()

  const isLoading =
    loadingPipes || loadingMaterials || loadingScrapTypes || loadingBalances || loadingThresholds

  if (isLoading) return <LoadingState />

  const balanceMap = new Map((balances ?? []).map((b) => [`${b.item_type}:${b.item_id}`, b.quantity]))
  const thresholdMap = new Map(
    (thresholds ?? []).map((t) => [`${t.item_type}:${t.item_id}`, t.min_quantity]),
  )

  const activePipes = (pipeProducts ?? []).filter((p) => p.is_active)
  const activeMaterials = (materialTypes ?? []).filter((m) => m.is_active)
  const activeScrapTypes = (scrapTypes ?? []).filter((s) => s.is_active)

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Set an optional starting stock and low-stock alert level for each item. Leave a field blank to
        keep it unset.
      </p>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Pipe Products</h3>
        {activePipes.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No active pipe sizes. Add some in the Pipe Sizes tab first.
          </p>
        ) : (
          <div className="space-y-2">
            {activePipes.map((p) => (
              <StockRow
                key={p.id}
                itemType="pipe_product"
                itemId={p.id}
                label={formatPipeProductLabel(p.diameter_inches, p.weight_kg)}
                unit="pcs"
                initialBalance={balanceMap.get(`pipe_product:${p.id}`) ?? null}
                initialThreshold={thresholdMap.get(`pipe_product:${p.id}`) ?? null}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Scrap</h3>
        {activeScrapTypes.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No active scrap types. Add some in the Scrap Types tab first.
          </p>
        ) : (
          <div className="space-y-2">
            {activeScrapTypes.map((s) => (
              <StockRow
                key={s.id}
                itemType="scrap"
                itemId={s.id}
                label={s.name}
                unit="kg"
                initialBalance={balanceMap.get(`scrap:${s.id}`) ?? null}
                initialThreshold={thresholdMap.get(`scrap:${s.id}`) ?? null}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Raw Materials</h3>
        {activeMaterials.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No active raw material types. Add some in the Raw Materials tab first.
          </p>
        ) : (
          <div className="space-y-2">
            {activeMaterials.map((m) => (
              <StockRow
                key={m.id}
                itemType="raw_material"
                itemId={m.id}
                label={m.name}
                unit="kg"
                initialBalance={balanceMap.get(`raw_material:${m.id}`) ?? null}
                initialThreshold={thresholdMap.get(`raw_material:${m.id}`) ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
