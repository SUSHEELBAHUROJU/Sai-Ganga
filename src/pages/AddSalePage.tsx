import { useState } from 'react'
import { usePipeProducts } from '../hooks/usePipeProducts'
import { useAddSalesEntries } from '../hooks/useSalesEntries'
import { useFinishedGoodsStock } from '../hooks/useStock'
import { DateField } from '../components/DateField'
import { CustomerPicker } from '../components/CustomerPicker'
import { PipeLineItemForm, type PendingLine } from '../components/PipeLineItemForm'
import { LineItemsList } from '../components/LineItemsList'
import { StickyActionBar } from '../components/StickyActionBar'
import { SaveButton } from '../components/SaveButton'
import { useEntryDate } from '../hooks/useEntryDate'
import { useToast } from '../lib/toast'

type Line = PendingLine & { localId: string }

export function AddSalePage() {
  const { data: pipeProducts, isLoading } = usePipeProducts()
  const { data: finishedGoods } = useFinishedGoodsStock()
  const addEntries = useAddSalesEntries()
  const { showToast } = useToast()

  const [entryDate, setEntryDate] = useEntryDate()
  const [customerId, setCustomerId] = useState<string>('')
  const [lines, setLines] = useState<Line[]>([])

  // Current DB stock minus quantity already staged in this cart, so the
  // oversell warning reflects what's really left once pending lines apply.
  function getAvailableStock(pipeProductId: string) {
    const stockRow = finishedGoods?.find((p) => p.pipe_product_id === pipeProductId)
    if (!stockRow) return null
    const staged = lines
      .filter((l) => l.pipeProductId === pipeProductId)
      .reduce((sum, l) => sum + l.quantity, 0)
    return (stockRow.current_stock ?? 0) - staged
  }

  function handleAddLine(line: PendingLine) {
    setLines((prev) => [...prev, { ...line, localId: crypto.randomUUID() }])
  }

  function handleRemoveLine(localId: string) {
    setLines((prev) => prev.filter((l) => l.localId !== localId))
  }

  function handleSave() {
    if (lines.length === 0) return
    if (!customerId) {
      showToast('Select a customer first', 'error')
      return
    }
    addEntries.mutate(
      lines.map((l) => ({
        entry_date: entryDate,
        customer_id: customerId,
        pipe_product_id: l.pipeProductId,
        quantity: l.quantity,
      })),
      {
        onSuccess: () => {
          showToast('Sale Added!')
          setLines([])
          setCustomerId('')
        },
        onError: () => showToast('Could not save sale', 'error'),
      },
    )
  }

  return (
    <div className="space-y-6 pb-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Add Sale</h2>
        <DateField value={entryDate} onChange={setEntryDate} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Who Bought It?
        </h3>
        <CustomerPicker value={customerId || null} onChange={setCustomerId} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading pipe sizes…</p>
        ) : (
          <PipeLineItemForm
            pipeProducts={pipeProducts ?? []}
            onAdd={handleAddLine}
            getAvailableStock={getAvailableStock}
            accent="sale"
          />
        )}
      </div>

      <LineItemsList lines={lines} onRemove={handleRemoveLine} />

      <StickyActionBar>
        <SaveButton
          accent="sale"
          onClick={handleSave}
          disabled={lines.length === 0}
          pending={addEntries.isPending}
          label={`Save Sale${lines.length > 0 ? ` (${lines.length})` : ''}`}
        />
      </StickyActionBar>
    </div>
  )
}
