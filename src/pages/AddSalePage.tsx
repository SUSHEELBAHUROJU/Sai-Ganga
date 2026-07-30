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
import { SaveButton } from '../components/SaveButton'
import { useEntryDate } from '../hooks/useEntryDate'
import { useToast } from '../lib/toast'
import { piecesToKg, formatPipeProductLabel } from '../lib/format'
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

  function handleSave(andCreateBill = false) {
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

        if (andCreateBill) {
          const savedIds = Array.isArray(res) ? res.map((r: any) => r.id) : []
          setStagedBillData({
            saleEntryIds: savedIds,
            entryDate,
            customerId,
            customerName: currentCustomer?.name || '',
            lines: preparedBillLines,
          })
          setBillModalOpen(true)
        }

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
          />
        )}
      </div>

      <LineItemsList lines={lines} onRemove={handleRemoveLine} />

      <StickyActionBar>
        <div className="flex w-full items-center gap-2">
          <SaveButton
            accent="sale"
            onClick={() => handleSave(false)}
            disabled={lines.length === 0}
            pending={addEntries.isPending}
            label={`Save Sale${lines.length > 0 ? ` (${lines.length})` : ''}`}
          />

          <button
            type="button"
            disabled={lines.length === 0 || addEntries.isPending}
            onClick={() => handleSave(true)}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors shrink-0"
          >
            <Receipt className="h-4 w-4" />
            Save &amp; Create Bill
          </button>
        </div>
      </StickyActionBar>

      <CreateBillModal
        open={billModalOpen}
        onClose={() => setBillModalOpen(false)}
        initialData={stagedBillData}
      />
    </div>
  )
}
