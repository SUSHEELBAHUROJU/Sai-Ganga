import { useState, useEffect } from 'react'
import { Modal } from './Modal'
import { Field } from './Field'
import { Plus, Trash2, Receipt } from 'lucide-react'
import { useCompanySettings } from '../hooks/useCompanySettings'
import { useNextBillNumber, useCreateBill, type BillLineItem } from '../hooks/useBills'
import { useCustomers } from '../hooks/useCustomers'
import { useToast } from '../lib/toast'
import { BillPdfModal } from './BillPdfModal'
import type { BillRow } from '../hooks/useBills'

type CreateBillModalProps = {
  open: boolean
  onClose: () => void
  /** Optional pre-filled sale data when creating bill from a Sale */
  initialData?: {
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
  }
  /** Callback when bill is successfully created */
  onCreated?: (bill: BillRow) => void
}

export function CreateBillModal({ open, onClose, initialData, onCreated }: CreateBillModalProps) {
  const { data: company } = useCompanySettings()
  const { data: nextBillNo, isLoading: loadingNextNum } = useNextBillNumber()
  const { data: customers } = useCustomers()
  const createBill = useCreateBill()
  const { showToast } = useToast()

  const [billDate, setBillDate] = useState(
    initialData?.entryDate || new Date().toISOString().split('T')[0],
  )
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialData?.customerId || '',
  )
  const [customerName, setCustomerName] = useState(initialData?.customerName || '')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  const [lineItems, setLineItems] = useState<BillLineItem[]>([])
  const [globalRate, setGlobalRate] = useState<string>('')
  const [discount, setDiscount] = useState<string>('0')
  const [tax, setTax] = useState<string>('0')
  const [notes, setNotes] = useState<string>('')

  const [createdBill, setCreatedBill] = useState<BillRow | null>(null)

  // Initialize form when initialData or modal opens
  useEffect(() => {
    if (open) {
      setBillDate(initialData?.entryDate || new Date().toISOString().split('T')[0])
      const custId = initialData?.customerId || ''
      setSelectedCustomerId(custId)

      const matchedCust = (customers ?? []).find((c) => c.id === custId)
      setCustomerName(matchedCust?.name || initialData?.customerName || '')
      setCustomerAddress(matchedCust?.address || '')
      setCustomerPhone(matchedCust?.phone || '')
      setGlobalRate('')

      if (initialData?.lines && initialData.lines.length > 0) {
        setLineItems(
          initialData.lines.map((l) => ({
            pipe_product_id: l.pipeProductId,
            description: l.description,
            quantity_pcs: l.quantityPcs,
            weight_kg: l.weightKg,
            price_per_kg: 0,
            amount: 0,
          })),
        )
      } else {
        setLineItems([
          {
            description: '',
            quantity_pcs: null,
            weight_kg: 0,
            price_per_kg: 0,
            amount: 0,
          },
        ])
      }

      setDiscount('0')
      setTax('0')
      setNotes('')
    }
  }, [open, initialData, customers])

  // Update customer fields when dropdown changes
  function handleCustomerSelect(id: string) {
    setSelectedCustomerId(id)
    const matched = (customers ?? []).find((c) => c.id === id)
    if (matched) {
      setCustomerName(matched.name)
      setCustomerAddress(matched.address || '')
      setCustomerPhone(matched.phone || '')
    }
  }

  // Handle setting rate for ALL items at once (user requested auto-fill for all products)
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

  function handleLineChange(index: number, field: keyof BillLineItem, value: any) {
    if (field === 'price_per_kg') {
      // User entered/changed price on line: auto-propagate to ALL lines as requested
      const price = parseFloat(value) || 0
      setGlobalRate(value)
      setLineItems((prev) =>
        prev.map((item, i) => {
          const kg = item.weight_kg || 0
          const itemPrice = i === index ? price : price
          return {
            ...item,
            price_per_kg: itemPrice,
            amount: Math.round(kg * itemPrice * 100) / 100,
          }
        }),
      )
      return
    }

    setLineItems((prev) => {
      const copy = [...prev]
      const item = { ...copy[index], [field]: value }

      if (field === 'weight_kg') {
        const kg = Number(value) || 0
        const price = item.price_per_kg || 0
        item.amount = Math.round(kg * price * 100) / 100
      }

      copy[index] = item
      return copy
    })
  }

  function addLineItem() {
    const defaultPrice = parseFloat(globalRate) || 0
    setLineItems((prev) => [
      ...prev,
      {
        description: '',
        quantity_pcs: null,
        weight_kg: 0,
        price_per_kg: defaultPrice,
        amount: 0,
      },
    ])
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0)
  const totalWeight = lineItems.reduce((sum, item) => sum + (item.weight_kg || 0), 0)
  const totalPcs = lineItems.reduce((sum, item) => sum + (item.quantity_pcs || 0), 0)

  const discountVal = Number(discount) || 0
  const taxVal = Number(tax) || 0
  const grandTotal = Math.max(0, subtotal - discountVal + taxVal)

  function handleSaveBill() {
    if (!customerName.trim()) {
      showToast('Please enter customer name', 'error')
      return
    }

    if (lineItems.length === 0) {
      showToast('Please add at least one line item', 'error')
      return
    }

    const invalidLine = lineItems.find((l) => !l.description.trim() || l.weight_kg <= 0)
    if (invalidLine) {
      showToast('Each line item must have a description and weight in kg', 'error')
      return
    }

    const billNumber = nextBillNo || `${company?.bill_prefix || 'SG-'}${String(company?.next_bill_number || 1).padStart(4, '0')}`

    createBill.mutate(
      {
        bill_number: billNumber,
        bill_date: billDate,
        customer_id: selectedCustomerId || null,
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim() || null,
        customer_phone: customerPhone.trim() || null,
        line_items: lineItems,
        subtotal,
        discount: discountVal,
        tax: taxVal,
        grand_total: grandTotal,
        notes: notes.trim() || null,
        sale_entry_ids: initialData?.saleEntryIds,
      },
      {
        onSuccess: (bill) => {
          showToast(`Bill ${bill.bill_number} created successfully!`)
          if (onCreated) onCreated(bill)
          setCreatedBill(bill)
        },
        onError: () => showToast('Could not create bill', 'error'),
      },
    )
  }

  if (createdBill) {
    return (
      <BillPdfModal
        open={open}
        bill={createdBill}
        onClose={() => {
          setCreatedBill(null)
          onClose()
        }}
      />
    )
  }

  return (
    <Modal title="Create Tax Invoice / Bill" open={open} onClose={onClose} maxWidthClass="md:max-w-3xl">
      <div className="space-y-5">
        {/* Header Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-teal-50 px-4 py-3 dark:bg-teal-950/40">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">Bill Number</span>
            <p className="font-mono text-base font-bold text-teal-700 dark:text-teal-300">
              {loadingNextNum
                ? 'Loading…'
                : nextBillNo || `${company?.bill_prefix || 'SG-'}${String(company?.next_bill_number || 1).padStart(4, '0')}`}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Bill Date
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="ml-2 min-h-[44px] min-w-0 rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
          </div>
        </div>

        {/* Customer Information */}
        <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Customer Information
          </h4>

          {(customers ?? []).length > 0 && (
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                Select Existing Customer (optional)
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">-- Custom / Select Customer --</option>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Customer Name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Full Name / Company"
            />
            <Field
              label="Phone Number"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+91 9876543210"
            />
          </div>

          <Field
            label="Address"
            value={customerAddress}
            onChange={(e) => setCustomerAddress(e.target.value)}
            placeholder="Delivery / Billing Address"
          />
        </div>

        {/* Global Selling Rate Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 p-3.5 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
              Selling Rate / kg:
            </span>
            <span className="text-xs text-amber-700 dark:text-amber-300">
              (Entering rate here updates all product items automatically)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">₹</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={globalRate}
              onChange={(e) => handleApplyGlobalRate(e.target.value)}
              placeholder="e.g. 70"
              className="min-h-[44px] w-28 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">/ kg</span>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Line Items ({lineItems.length})
            </h4>
            <button
              type="button"
              onClick={addLineItem}
              className="-mr-2 flex min-h-[44px] items-center gap-1 px-2 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>

          {/*
            One responsive grid rather than a <table>: six editable columns
            squeezed into a phone-width modal left every input about 35px
            wide. Below `sm` each line becomes a labelled card; from `sm` up
            the same markup snaps back to the original aligned columns.
          */}
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="hidden bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-700 sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_5.5rem_6rem_2rem] sm:gap-2 dark:bg-slate-800 dark:text-slate-300">
              <span>Item Description</span>
              <span className="text-right">Qty (Pcs)</span>
              <span className="text-right">Weight (kg)</span>
              <span className="text-right">Rate / kg (₹)</span>
              <span className="text-right">Amount (₹)</span>
              <span />
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {lineItems.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-2 gap-2 bg-white p-3 text-xs sm:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_5.5rem_6rem_2rem] sm:items-center sm:gap-2 sm:px-3 sm:py-2 dark:bg-slate-900"
                >
                  <label className="col-span-2 block sm:col-span-1">
                    <span className="mb-1 block font-medium text-slate-500 sm:hidden dark:text-slate-400">
                      Item Description
                    </span>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                      placeholder="Product name / size"
                      className="w-full min-w-0 rounded border border-slate-300 px-2 py-2 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1 block font-medium text-slate-500 sm:hidden dark:text-slate-400">
                      Qty (Pcs)
                    </span>
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={item.quantity_pcs != null ? item.quantity_pcs : ''}
                      onChange={(e) =>
                        handleLineChange(
                          index,
                          'quantity_pcs',
                          e.target.value ? parseInt(e.target.value, 10) : null,
                        )
                      }
                      placeholder="pcs"
                      className="w-full min-w-0 rounded border border-slate-300 px-2 py-2 text-right text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1 block font-medium text-slate-500 sm:hidden dark:text-slate-400">
                      Weight (kg)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={item.weight_kg || ''}
                      onChange={(e) =>
                        handleLineChange(index, 'weight_kg', parseFloat(e.target.value) || 0)
                      }
                      placeholder="0"
                      className="w-full min-w-0 rounded border border-slate-300 px-2 py-2 text-right text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1 block font-medium text-slate-500 sm:hidden dark:text-slate-400">
                      Rate / kg (₹)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      inputMode="decimal"
                      value={item.price_per_kg || ''}
                      onChange={(e) => handleLineChange(index, 'price_per_kg', e.target.value)}
                      placeholder="₹/kg"
                      className="w-full min-w-0 rounded border border-slate-300 px-2 py-2 text-right text-xs font-bold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>

                  <div className="flex min-w-0 items-center justify-between gap-2 border-t border-slate-100 pt-2 sm:justify-end sm:border-0 sm:pt-0 dark:border-slate-800">
                    <span className="font-medium text-slate-500 sm:hidden dark:text-slate-400">
                      Amount
                    </span>
                    <span className="truncate font-mono font-bold text-slate-900 dark:text-slate-100">
                      ₹{(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="col-span-2 flex items-center justify-end border-t border-slate-100 pt-2 sm:col-span-1 sm:border-0 sm:pt-0 dark:border-slate-800">
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => removeLineItem(index)}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 sm:-mr-2 sm:h-9 sm:w-9 dark:hover:bg-red-950/50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-1 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 sm:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_5.5rem_6rem_2rem] sm:items-center dark:bg-slate-800 dark:text-slate-200">
              <span className="col-span-2 sm:col-span-1">Total</span>
              <span className="sm:text-right">{totalPcs > 0 ? `${totalPcs} pcs` : '-'}</span>
              <span className="text-right">{totalWeight.toLocaleString()} kg</span>
              <span className="hidden sm:block" />
              <span className="col-span-2 text-right font-mono text-teal-700 sm:col-span-1 dark:text-teal-300">
                ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="hidden sm:block" />
            </div>
          </div>
        </div>

        {/* Totals & Adjustments */}
        <div className="flex flex-col items-end space-y-2 pt-2">
          <div className="w-full max-w-xs space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600 dark:text-slate-400">Discount (₹)</span>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="min-h-[36px] w-24 rounded border border-slate-300 px-2 py-0.5 text-right text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600 dark:text-slate-400">Tax / GST (₹)</span>
              <input
                type="number"
                min="0"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                className="min-h-[36px] w-24 rounded border border-slate-300 px-2 py-0.5 text-right text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="border-t border-slate-200 pt-2 dark:border-slate-700 flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100">
              <span>Grand Total</span>
              <span className="font-mono text-teal-700 dark:text-teal-300">
                ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <Field
          label="Notes / Terms (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Payment due in 15 days / Bank details"
        />

        {/* Action Bar */}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-2 sm:flex-row sm:justify-end dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={createBill.isPending}
            onClick={handleSaveBill}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <Receipt className="h-4 w-4" />
            {createBill.isPending ? 'Generating Bill…' : 'Generate & Save Bill'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
