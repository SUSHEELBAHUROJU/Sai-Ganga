import { useState, useEffect } from 'react'
import { Modal } from './Modal'
import { Field } from './Field'
import { Plus, Trash2, Save } from 'lucide-react'
import { useUpdateBill, type BillRow, type BillLineItem } from '../hooks/useBills'
import { useCustomers } from '../hooks/useCustomers'
import { usePipeProducts } from '../hooks/usePipeProducts'
import { useToast } from '../lib/toast'
import { formatPipeProductLabel, piecesToKg } from '../lib/format'

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
  const updateBill = useUpdateBill()
  const { showToast } = useToast()

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

  useEffect(() => {
    if (open && bill) {
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

  function handleApplyGlobalRate(rateStr: string) {
    setGlobalRate(rateStr)
    const price = parseFloat(rateStr) || 0
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
        onError: () => showToast('Failed to update bill', 'error'),
      },
    )
  }

  return (
    <Modal
      title={`Edit Tax Invoice — ${bill.bill_number}`}
      open={open}
      onClose={onClose}
      maxWidthClass="md:max-w-4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Bill Number"
            type="text"
            disabled
            value={bill.bill_number}
            className="bg-slate-100 font-mono font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          />

          <Field
            label="Invoice Date"
            type="date"
            required
            value={billDate}
            onChange={(e) => setBillDate(e.target.value)}
          />

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Select Registered Customer
            </span>
            <select
              value={selectedCustomerId}
              onChange={(e) => handleCustomerSelect(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">-- Custom / Cash Customer --</option>
              {(customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Customer Name"
            type="text"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="e.g. Susheel Polymers"
          />

          <Field
            label="Customer Phone"
            type="text"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="10-digit number"
          />

          <Field
            label="Customer Address"
            type="text"
            value={customerAddress}
            onChange={(e) => setCustomerAddress(e.target.value)}
            placeholder="City, District, State"
          />
        </div>

        {/* Global Rate Auto-Fill */}
        <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 dark:border-teal-900/60 dark:bg-teal-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-teal-900 dark:text-teal-200">
                Rate per Kg (Auto-fill all items)
              </span>
              <p className="text-[11px] text-teal-700 dark:text-teal-300">
                Entering a rate here automatically calculates price for all products in this bill.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-teal-800 dark:text-teal-200">₹</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={globalRate}
                onChange={(e) => handleApplyGlobalRate(e.target.value)}
                placeholder="Rate/kg (e.g. 75)"
                className="min-h-[44px] w-32 rounded-lg border border-teal-300 bg-white px-3 py-1.5 font-mono text-sm font-bold text-teal-900 outline-none focus:ring-2 focus:ring-teal-500 dark:border-teal-700 dark:bg-slate-900 dark:text-teal-100"
              />
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Bill Line Items
            </h4>
            <button
              type="button"
              onClick={handleAddLineItem}
              className="flex min-h-[44px] items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300"
            >
              <Plus className="h-3.5 w-3.5" />
              + Add Item to Bill
            </button>
          </div>

          {/*
            Was a hard `grid-cols-12`, which on a phone gave each numeric
            field two columns — about 38px, too narrow to read a rate in.
            Now: one field per row on mobile, the original dense row from
            `sm` up.
          */}
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {lineItems.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-2 items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs sm:grid-cols-12 sm:items-center dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Product Select / Description */}
                <div className="col-span-2 space-y-1 sm:col-span-4">
                  <select
                    aria-label="Pipe product"
                    value={item.pipe_product_id || ''}
                    onChange={(e) => handlePipeProductSelect(idx, e.target.value)}
                    className="min-h-[44px] w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">-- Select Pipe Product --</option>
                    {(pipeProducts ?? []).map((p) => {
                      const isSelectedElsewhere = lineItems.some(
                        (l, i) => i !== idx && l.pipe_product_id === p.id,
                      )
                      return (
                        <option key={p.id} value={p.id} disabled={isSelectedElsewhere}>
                          {formatPipeProductLabel(p.diameter_inches, p.weight_kg)}
                          {isSelectedElsewhere ? ' (Already added)' : ''}
                        </option>
                      )
                    })}
                  </select>

                  <input
                    type="text"
                    aria-label="Description"
                    value={item.description || ''}
                    onChange={(e) => handleDescriptionChange(idx, e.target.value)}
                    placeholder="Description"
                    className="min-h-[44px] w-full min-w-0 rounded-md border border-slate-200 px-2 py-2 text-xs text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                  />
                </div>

                {/* Qty Pcs */}
                <label className="block min-w-0 sm:col-span-2">
                  <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Pcs</span>
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={item.quantity_pcs ?? ''}
                    onChange={(e) => handleQuantityChange(idx, e.target.value)}
                    placeholder="Pcs"
                    className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 font-mono text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>

                {/*
                  Weight is derived (pcs x the product's per-piece weight) for
                  any line with a pipe product selected, so it's shown rather
                  than typed — a hand-edited weight could silently disagree
                  with the quantity. Custom lines with no product selected have
                  nothing to derive from, so those keep a real input.
                */}
                <label className="block min-w-0 sm:col-span-2">
                  <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    Weight (kg)
                  </span>
                  {item.pipe_product_id ? (
                    <span className="flex min-h-[38px] w-full items-center rounded-md border border-transparent bg-slate-100 px-2 py-2 font-mono text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                      {formatINR(item.weight_kg)}
                    </span>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={item.weight_kg || ''}
                      onChange={(e) => handleWeightChange(idx, e.target.value)}
                      placeholder="Total kg"
                      className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 font-mono text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  )}
                </label>

                {/* Price / Kg */}
                <label className="block min-w-0 sm:col-span-2">
                  <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    Rate (₹/kg)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={item.price_per_kg || ''}
                    onChange={(e) => handlePriceChange(idx, e.target.value)}
                    placeholder="₹/kg"
                    className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 font-mono text-xs text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>

                {/* Amount & Trash */}
                <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 border-t border-slate-200 pt-2 sm:col-span-2 sm:border-0 sm:pt-0 sm:pl-1 dark:border-slate-800">
                  <span className="truncate font-mono font-bold text-slate-900 dark:text-slate-100">
                    ₹{formatINR(item.amount)}
                  </span>

                  <button
                    type="button"
                    aria-label={`Remove line ${idx + 1}`}
                    disabled={lineItems.length <= 1}
                    onClick={() => handleRemoveLineItem(idx)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 sm:h-8 sm:w-8 dark:hover:bg-red-950/50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals Summary */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 font-medium">
            <span>Subtotal:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
              ₹{formatINR(subtotal)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200 sm:grid-cols-3 dark:border-slate-800">
            <Field
              label="Discount (₹)"
              type="number"
              step="0.01"
              min="0"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="font-mono text-xs"
            />

            <Field
              label="Tax / GST (₹)"
              type="number"
              step="0.01"
              min="0"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              className="font-mono text-xs"
            />

            <Field
              label="Transport (₹)"
              type="number"
              step="0.01"
              min="0"
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Grand Total:
            </span>
            <span className="font-mono text-lg font-bold text-teal-600 dark:text-teal-400">
              ₹{formatINR(grandTotal)}
            </span>
          </div>
        </div>

        <Field
          label="Notes / Terms on Bill"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Payment due in 15 days"
        />

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={updateBill.isPending}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {updateBill.isPending ? 'Saving...' : 'Save Bill Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
