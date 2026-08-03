import { useState } from 'react'
import { usePipeProducts } from '../hooks/usePipeProducts'
import { useAddSalesEntries } from '../hooks/useSalesEntries'
import { useFinishedGoodsStock } from '../hooks/useStock'
import { useCustomers } from '../hooks/useCustomers'
import { DateField } from '../components/DateField'
import { CustomerPicker } from '../components/CustomerPicker'
import { PipeLineItemForm, type PendingLine } from '../components/PipeLineItemForm'
import { LineItemsList } from '../components/LineItemsList'
import { StickyActionBar } from '../components/StickyActionBar'
import { useEntryDate } from '../hooks/useEntryDate'
import { useToast } from '../lib/toast'
import { piecesToKg, formatPipeProductLabel } from '../lib/format'
import { ACTION_STYLES } from '../lib/actionColors'
import { CreateBillModal } from '../components/CreateBillModal'
import { Receipt } from 'lucide-react'

type Line = PendingLine & { localId: string }

export function AddSalePage() {
  const { data: pipeProducts, isLoading } = usePipeProducts()
  const { data: finishedGoods } = useFinishedGoodsStock()
  const { data: customers } = useCustomers()
  const addEntries = useAddSalesEntries()
  const { showToast } = useToast()

  const [entryDate, setEntryDate] = useEntryDate()
  const [customerId, setCustomerId] = useState<string>('')
  const [lines, setLines] = useState<Line[]>([])

  const [billModalOpen, setBillModalOpen] = useState(false)
  const [stagedBillData, setStagedBillData] = useState<{
    saleEntryIds?: string[]
    entryDate?: string
    customerId?: string | null
    customerName?: string
    lines?: {
      pipeProductId?: string
      description: string
      weightKg: number
      quantityPcs?: number
    }[]
  } | undefined>(undefined)

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

  function handleUpdateQuantity(localId: string, newQuantity: number) {
    setLines((prev) =>
      prev.map((l) => (l.localId === localId ? { ...l, quantity: newQuantity } : l)),
    )
  }

  function handleSave() {
    if (lines.length === 0) return
    if (!customerId) {
      showToast('Select a customer first', 'error')
      return
    }

    const currentCustomer = (customers ?? []).find((c) => c.id === customerId)

    const preparedBillLines = lines.map((l) => {
      const product = pipeProducts?.find((p) => p.id === l.pipeProductId)
      const label = product
        ? formatPipeProductLabel(product.diameter_inches, product.weight_kg)
        : 'Pipe Product'
      const weightKg = product ? piecesToKg(l.quantity, product.weight_kg) : 0
      return {
        pipeProductId: l.pipeProductId,
        description: label,
        weightKg,
        quantityPcs: l.quantity,
      }
    })

    const payload = lines.map((l) => ({
      entry_date: entryDate,
      customer_id: customerId,
      pipe_product_id: l.pipeProductId,
      quantity: l.quantity,
    }))

    addEntries.mutate(payload, {
      onSuccess: (res: any) => {
        showToast('Sale Added!')

        const savedIds = Array.isArray(res) ? res.map((r: any) => r.id) : []
        setStagedBillData({
          saleEntryIds: savedIds,
          entryDate,
          customerId,
          customerName: currentCustomer?.name || '',
          lines: preparedBillLines,
        })
        setBillModalOpen(true)

        setLines([])
        setCustomerId('')
      },
      onError: () => showToast('Could not save sale', 'error'),
    })
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
            disabledProductIds={lines.map((l) => l.pipeProductId)}
          />
        )}
      </div>

      <LineItemsList
        lines={lines}
        onRemove={handleRemoveLine}
        onUpdateQuantity={handleUpdateQuantity}
      />

      <StickyActionBar>
        <button
          type="button"
          disabled={lines.length === 0 || addEntries.isPending}
          onClick={handleSave}
          className={`flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${ACTION_STYLES.sale.gradient}`}
        >
          <Receipt className="h-[18px] w-[18px]" strokeWidth={2.5} />
          {addEntries.isPending
            ? 'Saving…'
            : `Save & Create Bill${lines.length > 0 ? ` (${lines.length})` : ''}`}
        </button>
      </StickyActionBar>

      <CreateBillModal
        open={billModalOpen}
        onClose={() => setBillModalOpen(false)}
        initialData={stagedBillData}
      />
    </div>
  )
}
