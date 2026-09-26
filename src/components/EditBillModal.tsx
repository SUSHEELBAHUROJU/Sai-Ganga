import { useState, useEffect } from 'react'
import { Modal } from './Modal'
import { Field } from './Field'
import { Plus, Trash2, Save, Lock, Unlock, ChevronDown, ChevronUp } from 'lucide-react'
import {
  useBills,
  useUpdateBill,
  DuplicateBillNumberError,
  type BillRow,
  type BillLineItem,
} from '../hooks/useBills'
import { useCustomers } from '../hooks/useCustomers'
import { usePipeProducts } from '../hooks/usePipeProducts'
import { useToast } from '../lib/toast'
import { formatPipeProductLabel, formatQty, piecesToKg } from '../lib/format'
import { isFutureISODate, todayISODate } from '../lib/date'

type EditBillModalProps = {
  open: boolean
  bill: BillRow | null
  onClose: () => void
}

function parseLineItems(rawItems: any): BillLineItem[] {
  let items = rawItems
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items)
    } catch {
      items = []
    }
  }
  if (!Array.isArray(items)) return []
  return items.map((item) => {
    const weight_kg = Number(item?.weight_kg) || 0
    const price_per_kg = Number(item?.price_per_kg) || 0
    const amount = Number(item?.amount) || Math.round(weight_kg * price_per_kg * 100) / 100
    return {
      pipe_product_id: item?.pipe_product_id || null,
      description: item?.description || 'Pipe Product',
      quantity_pcs: item?.quantity_pcs != null ? Number(item.quantity_pcs) : null,
      weight_kg,
      price_per_kg,
      amount,
    }
  })
}

function formatINR(val: any): string {
  const n = Number(val) || 0
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function EditBillModal({ open, bill, onClose }: EditBillModalProps) {
  const { data: customers } = useCustomers()
  const { data: pipeProducts } = usePipeProducts()
  const { data: allBills } = useBills()
  const updateBill = useUpdateBill()
  const { showToast } = useToast()

  const [billNumber, setBillNumber] = useState('')
  // The invoice number stays locked until deliberately unlocked: GST expects a
  // stable, non-reusable series (voiding preserves the number for exactly that
  // reason), so renaming one should never happen by a stray tap.
  const [billNumberUnlocked, setBillNumberUnlocked] = useState(false)
  const [billDate, setBillDate] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  const [lineItems, setLineItems] = useState<BillLineItem[]>([])
  const [globalRate, setGlobalRate] = useState<string>('')
  const [discount, setDiscount] = useState<string>('0')
  const [tax, setTax] = useState<string>('0')
  const [transport, setTransport] = useState<string>('0')
  const [notes, setNotes] = useState<string>('')
  // Customer details are rarely what's being corrected, so they sit collapsed
  // behind a one-line summary and the line items get the first screen.
  const [customerOpen, setCustomerOpen] = useState(false)

  useEffect(() => {
    if (open && bill) {
      setBillNumber(bill.bill_number)
      setBillNumberUnlocked(false)
      setBillDate(bill.bill_date || new Date().toISOString().split('T')[0])
      setSelectedCustomerId(bill.customer_id || '')
      setCustomerName(bill.customer_name || '')
      setCustomerAddress(bill.customer_address || '')
      setCustomerPhone(bill.customer_phone || '')
      setDiscount(String(bill.discount ?? 0))
      setTax(String(bill.tax ?? 0))
      setTransport(String(bill.transport_charges ?? 0))
      setNotes(bill.notes || '')
      setGlobalRate('')
      setLineItems(parseLineItems(bill.line_items))
      setCustomerOpen(!bill.customer_name)
    }
  }, [open, bill])

  if (!open || !bill) return null

  function handleCustomerSelect(id: string) {
    setSelectedCustomerId(id)
    const matched = (customers ?? []).find((c) => c.id === id)
    if (matched) {
      setCustomerName(matched.name)
      setCustomerAddress(matched.address || '')
      setCustomerPhone(matched.phone || '')
    }
  }

  /** Explicit button rather than on every keystroke: typing "75" used to set
   *  every line to ₹7 first, and a stray tap in the box wiped all rates. */
  function applyRateToAll() {
    const price = parseFloat(globalRate) || 0
    if (price <= 0) {
      showToast('Enter a rate to apply', 'error')
      return
    }
    setLineItems((prev) =>
      prev.map((item) => {
        const kg = item.weight_kg || 0
        return {
          ...item,
          price_per_kg: price,
          amount: Math.round(kg * price * 100) / 100,
        }
      }),
    )
  }

  function handlePipeProductSelect(index: number, productId: string) {
    const product = (pipeProducts ?? []).find((p) => p.id === productId)
    setLineItems((prev) => {
      const next = [...prev]
      if (product && next[index]) {
        const pcs = next[index].quantity_pcs ?? 1
        const weightKg = piecesToKg(pcs, product.weight_kg)
        const price = next[index].price_per_kg || parseFloat(globalRate) || 0
        next[index] = {
          ...next[index],
          pipe_product_id: product.id,
          description: formatPipeProductLabel(product.diameter_inches, product.weight_kg),
          quantity_pcs: pcs,
          weight_kg: weightKg,
          price_per_kg: price,
          amount: Math.round(weightKg * price * 100) / 100,
        }
      } else if (next[index]) {
        next[index].pipe_product_id = null
      }
      return next
    })
  }

  function handleQuantityChange(index: number, pcsStr: string) {
    const pcs = parseInt(pcsStr) || 0
    setLineItems((prev) => {
      const next = [...prev]
      if (!next[index]) return prev
      const item = next[index]
      const product = (pipeProducts ?? []).find((p) => p.id === item.pipe_product_id)

      // Weight is read-only for product-linked lines, so clearing pcs has to
      // zero it — otherwise a stale figure would be uncorrectable by hand.
      let weightKg = item.weight_kg
      if (product) {
        weightKg = pcs > 0 ? piecesToKg(pcs, product.weight_kg) : 0
      }

      const price = item.price_per_kg || parseFloat(globalRate) || 0
      next[index] = {
        ...item,
        quantity_pcs: pcs > 0 ? pcs : null,
        weight_kg: weightKg,
        amount: Math.round(weightKg * price * 100) / 100,
      }
      return next
    })
  }

  function handleWeightChange(index: number, kgStr: string) {
    const kg = parseFloat(kgStr) || 0
    setLineItems((prev) => {
      const next = [...prev]
      if (!next[index]) return prev
      const item = next[index]
      const price = item.price_per_kg || parseFloat(globalRate) || 0
      next[index] = {
        ...item,
        weight_kg: kg,
        amount: Math.round(kg * price * 100) / 100,
      }
      return next
    })
  }

  function handlePriceChange(index: number, priceStr: string) {
    const price = parseFloat(priceStr) || 0
    setLineItems((prev) => {
      const next = [...prev]
      if (!next[index]) return prev
      const item = next[index]
      const kg = item.weight_kg || 0
      next[index] = {
        ...item,
        price_per_kg: price,
        amount: Math.round(kg * price * 100) / 100,
      }
      return next
    })
  }

  function handleDescriptionChange(index: number, desc: string) {
    setLineItems((prev) => {
      const next = [...prev]
      if (!next[index]) return prev
      next[index] = { ...next[index], description: desc }
      return next
    })
  }

  function handleAddLineItem() {
    const price = parseFloat(globalRate) || 0
    setLineItems((prev) => [
      ...prev,
      {
        pipe_product_id: null,
        description: '',
        quantity_pcs: null,
        weight_kg: 0,
        price_per_kg: price,
        amount: 0,
      },
    ])
  }

  function handleRemoveLineItem(index: number) {
    if (lineItems.length <= 1) return
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = lineItems.reduce((acc, item) => acc + (item.amount || 0), 0)
  const discountVal = parseFloat(discount) || 0
  const taxVal = parseFloat(tax) || 0
  const transportVal = parseFloat(transport) || 0
  const grandTotal = Math.max(0, subtotal - discountVal + taxVal + transportVal)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const trimmedBillNumber = billNumber.trim()
    if (!trimmedBillNumber) {
      showToast('Bill number cannot be empty', 'error')
      return
    }

    const billNumberChanged = trimmedBillNumber !== bill!.bill_number
    if (billNumberChanged) {
      // Compared case-insensitively even though the DB unique index is not:
      // "sg-0035" alongside "SG-0035" would technically save, but as two
      // invoices nobody could tell apart on paper.
      const clash = (allBills ?? []).find(
        (b) =>
          b.id !== bill!.id &&
          b.bill_number.toLowerCase() === trimmedBillNumber.toLowerCase(),
      )
      if (clash) {
        showToast(
          `Bill number ${clash.bill_number} is already used by another bill`,
          'error',
        )
        return
      }
    }

    if (isFutureISODate(billDate)) {
      showToast('Invoice date cannot be in the future', 'error')
      return
    }

    if (!customerName.trim()) {
      showToast('Please enter or select a customer name', 'error')
      return
    }

    const validLines = lineItems.filter(
      (l) => l.description.trim() !== '' && (l.weight_kg > 0 || l.amount > 0),
    )

    if (validLines.length === 0) {
      showToast('Please add at least one line item with weight/price', 'error')
      return
    }

    updateBill.mutate(
      {
        id: bill!.id,
        // Sent only on a real change so an untouched bill never rewrites its
        // own number or nudges the auto-increment counter.
        bill_number: billNumberChanged ? trimmedBillNumber : undefined,
        bill_date: billDate,
        customer_id: selectedCustomerId || null,
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim() || null,
        customer_phone: customerPhone.trim() || null,
        line_items: validLines,
        subtotal,
        discount: discountVal,
        tax: taxVal,
        transport_charges: transportVal,
        grand_total: grandTotal,
        notes: notes.trim() || null,
      },
      {
        onSuccess: (updated) => {
          showToast(`Bill ${updated.bill_number} updated successfully!`)
          onClose()
        },
        onError: (err) =>
          showToast(
            err instanceof DuplicateBillNumberError ? err.message : 'Failed to update bill',
            'error',
          ),
      },
    )
  }

  const customerSummary = [customerPhone.trim(), customerAddress.trim()].filter(Boolean).join(' · ')
  // text-base on every input: iOS zooms the page on focus for anything
  // smaller, which on this form meant the sheet jumped around on each tap.
  const numberInputClass =
    'min-h-[44px] w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-2 font-mono text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

  return (
    <Modal title={`Edit Bill ${bill.bill_number}`} open={open} onClose={onClose} maxWidthClass="md:max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {/*
            Hand-rolled rather than a <Field> because the label row carries the
            lock toggle. Locked uses readOnly, not disabled, so the number can
            still be selected and copied while it can't be typed over.
          */}
          <div className="min-w-0">
            <span className="mb-1 flex items-center justify-between gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              <label htmlFor="edit-bill-number">Bill No.</label>
              <button
                type="button"
                onClick={() => {
                  if (billNumberUnlocked) {
                    // Re-locking is the "undo that" gesture — drop whatever was
                    // typed rather than leaving an edit staged out of sight.
                    setBillNumber(bill!.bill_number)
                    setBillNumberUnlocked(false)
                  } else {
                    setBillNumberUnlocked(true)
                  }
                }}
                aria-label={billNumberUnlocked ? 'Lock bill number' : 'Unlock bill number for editing'}
                className={`-my-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold ${
                  billNumberUnlocked
                    ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/50'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                {billNumberUnlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {billNumberUnlocked ? 'Lock' : 'Edit'}
              </button>
            </span>
            <input
              id="edit-bill-number"
              type="text"
              required
              readOnly={!billNumberUnlocked}
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              className={`min-h-[44px] w-full min-w-0 rounded-lg border px-3 py-2.5 font-mono text-base font-bold outline-none ${
                billNumberUnlocked
                  ? 'border-amber-400 bg-white text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-amber-600 dark:bg-slate-900 dark:text-slate-100'
                  : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            />
          </div>

          <Field
            label="Bill Date"
            type="date"
            required
            value={billDate}
            max={todayISODate()}
            onChange={(e) => setBillDate(e.target.value)}
            className="min-h-[44px] min-w-0 px-2"
          />
        </div>

        {billNumberUnlocked && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            Invoice numbers are meant to run in one unbroken series — change this only to correct a
            mistake, not on a bill already shared or filed.
          </p>
        )}

        {/* Customer — one-line summary, expands to edit */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setCustomerOpen((v) => !v)}
            aria-expanded={customerOpen}
            className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3 py-2 text-left"
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Customer</span>
              <span className="block truncate font-semibold text-slate-900 dark:text-slate-100">
                {customerName.trim() || 'Not set'}
              </span>
              {!customerOpen && customerSummary && (
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{customerSummary}</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400">
              {customerOpen ? 'Done' : 'Change'}
              {customerOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>

          {customerOpen && (
            <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Pick a saved customer
                </span>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">-- Cash / not saved --</option>
                  {(customers ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Name on Bill"
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Susheel Polymers"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Phone"
                  type="text"
                  inputMode="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="10-digit number"
                />
                <Field
                  label="Address"
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="City, District"
                />
              </div>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Items ({lineItems.length})
            </h4>
            <button
              type="button"
              onClick={handleAddLineItem}
              className="flex min-h-[44px] items-center gap-1 rounded-lg bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Changing pieces or items here also updates this bill's sale entries and stock.
          </p>

          {lineItems.length > 1 && (
            <div className="flex items-end gap-2 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-900">
              <label className="block min-w-0 flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Same rate for all items (₹/kg)
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={globalRate}
                  onChange={(e) => setGlobalRate(e.target.value)}
                  placeholder="e.g. 95"
                  className={numberInputClass}
                />
              </label>
              <button
                type="button"
                onClick={applyRateToAll}
                className="min-h-[44px] shrink-0 rounded-lg border border-teal-300 bg-white px-3 text-sm font-semibold text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-300"
              >
                Apply to all
              </button>
            </div>
          )}

          {/*
            No inner scroll box: a fixed-height scrolling list inside the
            already-scrolling sheet showed ~1.5 items on a phone, and a swipe
            scrolled whichever of the two it happened to land on.
          */}
          {lineItems.map((item, idx) => (
            <div
              key={idx}
              className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Item {idx + 1}
                </span>
                <button
                  type="button"
                  aria-label={`Remove item ${idx + 1}`}
                  disabled={lineItems.length <= 1}
                  onClick={() => handleRemoveLineItem(idx)}
                  className="-my-1 -mr-1 flex min-h-[40px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-red-950/50"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>

              {/*
                Picking a product already sets description to its label
                (handlePipeProductSelect), so a free-text box underneath it just
                let the two drift apart. Only a custom line (no product picked)
                needs typed text.
              */}
              <select
                aria-label="Pipe product"
                value={item.pipe_product_id || ''}
                onChange={(e) => handlePipeProductSelect(idx, e.target.value)}
                className="min-h-[44px] w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-2 text-base font-semibold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">-- Other (type description) --</option>
                {(pipeProducts ?? []).map((p) => {
                  const isSelectedElsewhere = lineItems.some((l, i) => i !== idx && l.pipe_product_id === p.id)
                  return (
                    <option key={p.id} value={p.id} disabled={isSelectedElsewhere}>
                      {formatPipeProductLabel(p.diameter_inches, p.weight_kg)}
                      {isSelectedElsewhere ? ' (Already added)' : ''}
                    </option>
                  )
                })}
              </select>

              {!item.pipe_product_id && (
                <input
                  type="text"
                  aria-label="Description"
                  value={item.description || ''}
                  onChange={(e) => handleDescriptionChange(idx, e.target.value)}
                  placeholder="Description"
                  className="min-h-[44px] w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 text-base text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              )}

              <div className="grid grid-cols-3 gap-2">
                <label className="block min-w-0">
                  <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Pieces</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={item.quantity_pcs ?? ''}
                    onChange={(e) => handleQuantityChange(idx, e.target.value)}
                    placeholder="0"
                    className={numberInputClass}
                  />
                </label>

                {/*
                  Weight is derived (pcs x the product's per-piece weight) for
                  any line with a pipe product selected, so it's shown rather
                  than typed. Custom lines have nothing to derive from, so
                  those keep a real input.
                */}
                <label className="block min-w-0">
                  <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Weight (kg)</span>
                  {item.pipe_product_id ? (
                    <span className="flex min-h-[44px] w-full items-center rounded-md bg-slate-100 px-2 font-mono text-base text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                      {formatQty(item.weight_kg)}
                    </span>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={item.weight_kg || ''}
                      onChange={(e) => handleWeightChange(idx, e.target.value)}
                      placeholder="0"
                      className={numberInputClass}
                    />
                  )}
                </label>

                <label className="block min-w-0">
                  <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Rate ₹/kg</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={item.price_per_kg || ''}
                    onChange={(e) => handlePriceChange(idx, e.target.value)}
                    placeholder="0"
                    className={numberInputClass}
                  />
                </label>
              </div>

              <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatQty(item.weight_kg)} kg × ₹{formatQty(item.price_per_kg)}
                </span>
                <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                  ₹{formatINR(item.amount)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Charges */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex justify-between text-sm font-medium text-slate-600 dark:text-slate-400">
            <span>Items total</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">₹{formatINR(subtotal)}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="block min-w-0">
              <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Discount ₹</span>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className={numberInputClass}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">GST ₹</span>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                className={numberInputClass}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Transport ₹</span>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
                className={numberInputClass}
              />
            </label>
          </div>
        </div>

        <Field
          label="Notes on Bill (optional)"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Payment due in 15 days"
        />

        {/*
          Pinned to the bottom of the sheet so the running total and Save are
          always in reach while editing items, instead of a scroll away. The
          negative offset/margin cancel Modal's bottom padding, so nothing
          scrolls by underneath the bar; the safe-area inset moves inside it.
        */}
        <div
          className="sticky -mx-5 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 pt-3 dark:border-slate-800 dark:bg-slate-900"
          style={{
            bottom: 'calc(-1.25rem - env(safe-area-inset-bottom, 0px))',
            marginBottom: 'calc(-1.25rem - env(safe-area-inset-bottom, 0px))',
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Grand Total</p>
            <p className="truncate font-mono text-lg font-bold text-teal-600 dark:text-teal-400">
              ₹{formatINR(grandTotal)}
            </p>
          </div>
          <button
            type="submit"
            disabled={updateBill.isPending}
            className="flex min-h-[48px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-5 py-2 text-base font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {updateBill.isPending ? 'Saving…' : 'Save Bill'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
