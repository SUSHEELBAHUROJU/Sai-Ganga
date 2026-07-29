import { useMemo, useState } from 'react'
import { usePipeProducts } from '../../hooks/usePipeProducts'
import { useAddProductionEntries, useProductionEntriesByDate } from '../../hooks/useProductionEntries'
import { PipeLineItemForm, type PendingLine } from '../../components/PipeLineItemForm'
import { LineItemsList } from '../../components/LineItemsList'
import { AmountKgPcs } from '../../components/AmountKgPcs'
import { StickyActionBar } from '../../components/StickyActionBar'
import { SaveButton } from '../../components/SaveButton'
import { useToast } from '../../lib/toast'
import { formatDateLabel } from '../../lib/date'
import { piecesToKg, formatPipeProductLabel } from '../../lib/format'

type Line = PendingLine & { localId: string }
type ProductSummaryRow = { label: string; pcs: number; kg: number }

export function PipesTab({ entryDate }: { entryDate: string }) {
  const { data: pipeProducts, isLoading } = usePipeProducts()
  const addEntries = useAddProductionEntries()
  const { showToast } = useToast()

  const [lines, setLines] = useState<Line[]>([])

  const { data: todayEntries } = useProductionEntriesByDate(entryDate)

  const todaySummary = useMemo(() => {
    const map = new Map<string, ProductSummaryRow>()
    let totalPcs = 0
    let totalKg = 0
    for (const entry of todayEntries ?? []) {
      const product = entry.pipe_products
      const label = product
        ? formatPipeProductLabel(product.diameter_inches, product.weight_kg)
        : 'Unknown'
      const kg = product ? piecesToKg(entry.quantity, product.weight_kg) : 0
      const existing = map.get(label) ?? { label, pcs: 0, kg: 0 }
      existing.pcs += entry.quantity
      existing.kg += kg
      map.set(label, existing)
      totalPcs += entry.quantity
      totalKg += kg
    }
    return { rows: Array.from(map.values()), totalPcs, totalKg }
  }, [todayEntries])

  function handleAddLine(line: PendingLine) {
    setLines((prev) => [...prev, { ...line, localId: crypto.randomUUID() }])
  }

  function handleRemoveLine(localId: string) {
    setLines((prev) => prev.filter((l) => l.localId !== localId))
  }

  function handleSave() {
    if (lines.length === 0) return
    addEntries.mutate(
      lines.map((l) => ({
        entry_date: entryDate,
        pipe_product_id: l.pipeProductId,
        quantity: l.quantity,
      })),
      {
        onSuccess: () => {
          showToast('Production Added!')
          setLines([])
        },
        onError: () => showToast('Could not save production', 'error'),
      },
    )
  }

  return (
    <div className="space-y-6 pb-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading pipe sizes…</p>
        ) : (
          <PipeLineItemForm pipeProducts={pipeProducts ?? []} onAdd={handleAddLine} accent="production" />
        )}
      </div>

      <LineItemsList lines={lines} onRemove={handleRemoveLine} />

      <StickyActionBar>
        <SaveButton
          accent="production"
          onClick={handleSave}
          disabled={lines.length === 0}
          pending={addEntries.isPending}
          label={`Save Production${lines.length > 0 ? ` (${lines.length})` : ''}`}
        />
      </StickyActionBar>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
          {formatDateLabel(entryDate)}'s production so far
        </h3>
        {todaySummary.rows.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No production logged yet.</p>
        ) : (
          <div className="space-y-1.5">
            {todaySummary.rows.map((row) => (
              <div key={row.label} className="flex justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-300">{row.label}</span>
                <AmountKgPcs kg={row.kg} pcs={row.pcs} />
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold dark:border-slate-800">
              <span>Total</span>
              <AmountKgPcs kg={todaySummary.totalKg} pcs={todaySummary.totalPcs} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
