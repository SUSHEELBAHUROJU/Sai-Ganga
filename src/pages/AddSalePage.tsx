import { useEffect, useRef, useState } from 'react'
import { usePipeProducts } from '../hooks/usePipeProducts'
import { useFinishedGoodsStock } from '../hooks/useStock'
import { useCustomers } from '../hooks/useCustomers'
import { useCreateSaleWithBill, useNextBillNumber, type BillRow } from '../hooks/useBills'
import { DateField } from '../components/DateField'
import { CustomerPicker } from '../components/CustomerPicker'
import { PipeLineItemForm, type PendingLine } from '../components/PipeLineItemForm'
import { LineItemsList } from '../components/LineItemsList'
import { SaleBillPreview } from '../components/SaleBillPreview'
import { saleLineAmount, saleLineKg, type SaleLine } from '../lib/saleBill'
import { StickyActionBar } from '../components/StickyActionBar'
import { BillPdfModal } from '../components/BillPdfModal'
import { useEntryDate } from '../hooks/useEntryDate'
import { useToast } from '../lib/toast'
import { formatDateLabel, isFutureISODate } from '../lib/date'
import { formatPipeProductLabel, formatQty } from '../lib/format'
import { ACTION_STYLES } from '../lib/actionColors'
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react'

type Step = 1 | 2 | 3

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: 'Pipes' },
  { step: 2, label: 'Rate & Charges' },
  { step: 3, label: 'Review Bill' },
]

const rupees = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const numberInputClass =
  'min-h-[44px] w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-2 font-mono text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

function StepIndicator({ current }: { current: Step }) {
  return (
    <ol className="flex gap-1.5">
      {STEPS.map(({ step, label }) => {
        const state = step === current ? 'current' : step < current ? 'done' : 'todo'
        return (
          <li key={step} className="min-w-0 flex-1">
            <div
              className={`h-1.5 rounded-full ${state === 'todo' ? 'bg-slate-200 dark:bg-slate-800' : 'bg-green-600'}`}
            />
            <p
              className={`mt-1 truncate text-xs font-semibold ${
                state === 'current'
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {step}. {label}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Sale as three steps, nothing saved until the last one:
 *   1. Pipes — who bought it, and what (Add to List)
 *   2. Rate & Charges — one rate per kg for every pipe (sales are priced by
 *      weight), plus transport / discount / GST / note
 *   3. Review Bill — the bill as it will be generated → Generate Bill,
 *      which saves the sale and its bill together and opens Share / Print.
 * Previous goes back a step with everything kept.
 */
export function AddSalePage() {
  const { data: pipeProducts, isLoading } = usePipeProducts()
  const { data: finishedGoods } = useFinishedGoodsStock()
  const { data: customers } = useCustomers()
  const { data: nextBillNumber } = useNextBillNumber()
  const createSale = useCreateSaleWithBill()
  const { showToast } = useToast()

  const [step, setStep] = useState<Step>(1)
  const [entryDate, setEntryDate] = useEntryDate()
  const [customerId, setCustomerId] = useState<string>('')
  const [lines, setLines] = useState<SaleLine[]>([])
  const [rate, setRate] = useState('')
  const rateInputRef = useRef<HTMLInputElement>(null)
  const [transport, setTransport] = useState('')
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [notes, setNotes] = useState('')
  const [createdBill, setCreatedBill] = useState<BillRow | null>(null)

  const customer = (customers ?? []).find((c) => c.id === customerId) ?? null

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

  function handleChangeQuantity(localId: string, quantity: number) {
    setLines((prev) => prev.map((l) => (l.localId === localId ? { ...l, quantity } : l)))
  }

  function handleRemoveLine(localId: string) {
    setLines((prev) => prev.filter((l) => l.localId !== localId))
  }

  // Ask for the price as soon as step 2 opens.
  useEffect(() => {
    if (step === 2) rateInputRef.current?.focus()
  }, [step])

  const rateVal = Number(rate) || 0
  const itemsTotal = lines.reduce((sum, l) => sum + saleLineAmount(l, rateVal), 0)
  const totalKg = lines.reduce((sum, l) => sum + saleLineKg(l), 0)
  const transportVal = Number(transport) || 0
  const discountVal = Number(discount) || 0
  const taxVal = Number(tax) || 0
  const grandTotal = Math.max(0, itemsTotal - discountVal + taxVal + transportVal)

  // What stops the current step from moving on, said plainly above the button.
  const blocker =
    step === 1
      ? !customerId
        ? 'Pick who bought it'
        : lines.length === 0
          ? 'Add at least one pipe to the list'
          : null
      : step === 2
        ? lines.length === 0
          ? 'Go back and add a pipe'
          : rateVal <= 0
            ? 'Enter the rate per kg'
            : null
        : null

  function goTo(next: Step) {
    setStep(next)
    window.scrollTo({ top: 0 })
  }

  function resetForm() {
    setStep(1)
    setLines([])
    setCustomerId('')
    setRate('')
    setTransport('')
    setDiscount('')
    setTax('')
    setNotes('')
  }

  function handleGenerate() {
    if (isFutureISODate(entryDate)) {
      showToast('Sale date cannot be in the future', 'error')
      return
    }
    if (!customer || lines.length === 0 || rateVal <= 0) {
      showToast('Something is missing — go back and check', 'error')
      return
    }

    const lineItems = lines.map((l) => {
      const product = pipeProducts?.find((p) => p.id === l.pipeProductId)
      return {
        pipe_product_id: l.pipeProductId,
        description: product ? formatPipeProductLabel(product.diameter_inches, product.weight_kg) : l.label,
        quantity_pcs: l.quantity,
        weight_kg: saleLineKg(l),
        price_per_kg: rateVal,
        amount: saleLineAmount(l, rateVal),
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
          showToast(`Bill ${bill.bill_number} generated`)
          resetForm()
          setCreatedBill(bill)
        },
        onError: () => showToast('Could not generate the bill — nothing was saved, try again', 'error'),
      },
    )
  }

  return (
    <div className="space-y-6 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Add Sale</h2>
        {step === 1 ? (
          <DateField value={entryDate} onChange={setEntryDate} />
        ) : (
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {customer?.name} · {formatDateLabel(entryDate)}
          </p>
        )}
      </div>

      <StepIndicator current={step} />

      {step === 1 && (
        <>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Who Bought It?</h3>
            <CustomerPicker value={customerId || null} onChange={setCustomerId} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Add Pipes</h3>
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

          <LineItemsList lines={lines} onRemove={handleRemoveLine} onUpdateQuantity={handleChangeQuantity} />
        </>
      )}

      {step === 2 && (
        <>
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <label className="block">
              <span className="mb-1 block text-base font-semibold text-slate-800 dark:text-slate-200">
                Rate per kg (₹)
              </span>
              <input
                ref={rateInputRef}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="e.g. 95"
                className="min-h-[52px] w-full rounded-lg border-2 border-green-500 bg-white px-3 py-2 font-mono text-2xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-green-500 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                Applies to every pipe — the bill is by weight ({formatQty(totalKg)} kg).
              </span>
            </label>

            <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {lines.map((line, idx) => (
                <li key={line.localId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      <span className="mr-1.5 text-xs text-slate-400">{idx + 1}.</span>
                      {line.label}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatQty(line.quantity)} pcs · {formatQty(saleLineKg(line))} kg
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                    ₹{rupees(saleLineAmount(line, rateVal))}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-medium text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <span>Items total</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">₹{rupees(itemsTotal)}</span>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Other Charges (optional)</h3>
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
                  className={numberInputClass}
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
                  className={numberInputClass}
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
                  className={numberInputClass}
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
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-2 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Bill total</span>
              <span className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">₹{rupees(grandTotal)}</span>
            </div>
          </div>
        </>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Check the bill. Nothing is saved until you tap <span className="font-semibold">Generate Bill</span>.
          </p>
          <SaleBillPreview
            billNumber={nextBillNumber ?? null}
            billDate={entryDate}
            customer={customer}
            lines={lines}
            rate={rateVal}
            transport={transportVal}
            discount={discountVal}
            tax={taxVal}
            notes={notes}
          />
        </div>
      )}

      <StickyActionBar>
        {blocker && (
          <p className="mb-2 text-center text-sm font-semibold text-amber-700 dark:text-amber-400">{blocker}</p>
        )}
        <div className="flex gap-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => goTo((step - 1) as Step)}
              disabled={createSale.isPending}
              className="flex min-h-[50px] shrink-0 items-center justify-center gap-1 rounded-2xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <ChevronLeft className="h-5 w-5" />
              Previous
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              disabled={Boolean(blocker)}
              onClick={() => goTo((step + 1) as Step)}
              className={`flex min-h-[50px] flex-1 items-center justify-center gap-1 rounded-2xl py-3.5 text-base font-bold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${ACTION_STYLES.sale.gradient}`}
            >
              Next
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={createSale.isPending}
              onClick={handleGenerate}
              className={`flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${ACTION_STYLES.sale.gradient}`}
            >
              <Receipt className="h-[18px] w-[18px]" strokeWidth={2.5} />
              {createSale.isPending ? 'Generating…' : 'Generate Bill'}
            </button>
          )}
        </div>
      </StickyActionBar>

      <BillPdfModal open={createdBill !== null} bill={createdBill} onClose={() => setCreatedBill(null)} />
    </div>
  )
}
