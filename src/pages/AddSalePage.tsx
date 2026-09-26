import { useState } from 'react'
import { usePipeProducts } from '../hooks/usePipeProducts'
import { useFinishedGoodsStock } from '../hooks/useStock'
import { useCustomers } from '../hooks/useCustomers'
import { useCreateSaleWithBill, type BillRow } from '../hooks/useBills'
import { DateField } from '../components/DateField'
import { CustomerPicker } from '../components/CustomerPicker'
import { PipeLineItemForm, type PendingLine } from '../components/PipeLineItemForm'
import { SaleBillItems, lineAmount, type SaleLine } from '../components/SaleBillItems'
import { StickyActionBar } from '../components/StickyActionBar'
import { BillPdfModal } from '../components/BillPdfModal'
import { useEntryDate } from '../hooks/useEntryDate'
import { useToast } from '../lib/toast'
import { isFutureISODate } from '../lib/date'
import { piecesToKg, formatPipeProductLabel } from '../lib/format'
import { ACTION_STYLES } from '../lib/actionColors'
import { Receipt, ChevronDown, ChevronUp } from 'lucide-react'

const rupees = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const chargeInputClass =
  'min-h-[44px] w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-2 font-mono text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

/**
 * One flow, one save: pick the customer, add each size with its pcs and rate,
 * then "Save & Create Bill" records the sale and its bill together and opens
 * Share / Print. (It used to save the sale first and then ask for rates on a
 * second screen — two saves, and closing the second left a sale with no bill.)
 */
export function AddSalePage() {
  const { data: pipeProducts, isLoading } = usePipeProducts()
  const { data: finishedGoods } = useFinishedGoodsStock()
  const { data: customers } = useCustomers()
  const createSale = useCreateSaleWithBill()
  const { showToast } = useToast()

  const [entryDate, setEntryDate] = useEntryDate()
  const [customerId, setCustomerId] = useState<string>('')
  const [lines, setLines] = useState<SaleLine[]>([])
  const [focusLineId, setFocusLineId] = useState<string | null>(null)
  const [chargesOpen, setChargesOpen] = useState(false)
  const [transport, setTransport] = useState('')
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [notes, setNotes] = useState('')
  const [createdBill, setCreatedBill] = useState<BillRow | null>(null)

  function getAvailableStock(pipeProductId: string) {
    const stockRow = finishedGoods?.find((p) => p.pipe_product_id === pipeProductId)
    if (!stockRow) return null
    const staged = lines
      .filter((l) => l.pipeProductId === pipeProductId)
      .reduce((sum, l) => sum + l.quantity, 0)
    return (stockRow.current_stock ?? 0) - staged
  }

  function handleAddLine(line: PendingLine) {
    const localId = crypto.randomUUID()
    // Most loads go at one rate, so start from the previous line's — the field
    // takes focus with it selected, so a different rate is just typed over.
    const previousRate = lines[lines.length - 1]?.rate ?? ''
    setLines((prev) => [...prev, { ...line, localId, rate: previousRate }])
    setFocusLineId(localId)
  }

  function handleChangeLine(localId: string, patch: Partial<Pick<SaleLine, 'quantity' | 'rate'>>) {
    setLines((prev) => prev.map((l) => (l.localId === localId ? { ...l, ...patch } : l)))
  }

  function handleRemoveLine(localId: string) {
    setLines((prev) => prev.filter((l) => l.localId !== localId))
  }

  const itemsTotal = lines.reduce((sum, l) => sum + lineAmount(l), 0)
  const transportVal = Number(transport) || 0
  const discountVal = Number(discount) || 0
  const taxVal = Number(tax) || 0
  const grandTotal = Math.max(0, itemsTotal - discountVal + taxVal + transportVal)
  const missingRates = lines.filter((l) => !(Number(l.rate) > 0)).length

  const blocker =
    lines.length === 0
      ? null
      : !customerId
        ? 'Pick who bought it (top of the page)'
        : missingRates > 0
          ? `Enter the rate for ${missingRates} item${missingRates === 1 ? '' : 's'}`
          : null

  function resetForm() {
    setLines([])
    setCustomerId('')
    setFocusLineId(null)
    setChargesOpen(false)
    setTransport('')
    setDiscount('')
    setTax('')
    setNotes('')
  }

  function handleSave() {
    if (lines.length === 0 || blocker) return
    if (isFutureISODate(entryDate)) {
      showToast('Sale date cannot be in the future', 'error')
      return
    }
    const customer = (customers ?? []).find((c) => c.id === customerId)
    if (!customer) {
      showToast('Pick who bought it', 'error')
      return
    }

    const lineItems = lines.map((l) => {
      const product = pipeProducts?.find((p) => p.id === l.pipeProductId)
      return {
        pipe_product_id: l.pipeProductId,
        description: product ? formatPipeProductLabel(product.diameter_inches, product.weight_kg) : l.label,
        quantity_pcs: l.quantity,
        weight_kg: piecesToKg(l.quantity, l.weightKg),
        price_per_kg: Number(l.rate),
        amount: lineAmount(l),
      }
    })

    createSale.mutate(
      {
        bill_date: entryDate,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_address: customer.address,
        customer_phone: customer.phone,
        line_items: lineItems,
        subtotal: itemsTotal,
        discount: discountVal,
        tax: taxVal,
        transport_charges: transportVal,
        grand_total: grandTotal,
        notes: notes.trim() || null,
      },
      {
        onSuccess: (bill) => {
          showToast(`Bill ${bill.bill_number} saved`)
          resetForm()
          setCreatedBill(bill)
        },
        onError: () => showToast('Could not save — nothing was recorded, try again', 'error'),
      },
    )
  }

  return (
    <div className="space-y-6 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Add Sale</h2>
        <DateField value={entryDate} onChange={setEntryDate} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">1. Who Bought It?</h3>
        <CustomerPicker value={customerId || null} onChange={setCustomerId} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
          2. Add Pipes {lines.length > 0 && `(${lines.length} added)`}
        </h3>
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
      </div>

      {lines.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">3. Rate for Each Pipe</h3>
          <SaleBillItems
            lines={lines}
            focusLineId={focusLineId}
            onChange={handleChangeLine}
            onRemove={handleRemoveLine}
          />

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex justify-between text-sm font-medium text-slate-600 dark:text-slate-400">
              <span>Items total</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">₹{rupees(itemsTotal)}</span>
            </div>

            <button
              type="button"
              onClick={() => setChargesOpen((v) => !v)}
              aria-expanded={chargesOpen}
              className="flex min-h-[44px] w-full items-center justify-between text-sm font-semibold text-teal-700 dark:text-teal-400"
            >
              Transport / Discount / GST / Note (optional)
              {chargesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {chargesOpen && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <label className="block min-w-0">
                    <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Transport ₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={transport}
                      onChange={(e) => setTransport(e.target.value)}
                      placeholder="0"
                      className={chargeInputClass}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Discount ₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      placeholder="0"
                      className={chargeInputClass}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">GST ₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                      placeholder="0"
                      className={chargeInputClass}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Note on bill</span>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Payment due in 15 days"
                    className="min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      <StickyActionBar>
        {blocker && (
          <p className="mb-2 text-center text-sm font-semibold text-amber-700 dark:text-amber-400">{blocker}</p>
        )}
        <button
          type="button"
          disabled={lines.length === 0 || Boolean(blocker) || createSale.isPending}
          onClick={handleSave}
          className={`flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${ACTION_STYLES.sale.gradient}`}
        >
          <Receipt className="h-[18px] w-[18px]" strokeWidth={2.5} />
          {createSale.isPending
            ? 'Saving…'
            : lines.length === 0
              ? 'Save & Create Bill'
              : `Save & Create Bill · ₹${rupees(grandTotal)}`}
        </button>
      </StickyActionBar>

      <BillPdfModal open={createdBill !== null} bill={createdBill} onClose={() => setCreatedBill(null)} />
    </div>
  )
}
