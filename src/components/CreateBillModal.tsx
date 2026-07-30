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

  function handleLineChange(index: number, field: keyof BillLineItem, value: any) {
    setLineItems((prev) => {
      const copy = [...prev]
      const item = { ...copy[index], [field]: value }

      if (field === 'weight_kg' || field === 'price_per_kg') {
        const kg = Number(field === 'weight_kg' ? value : item.weight_kg) || 0
        const price = Number(field === 'price_per_kg' ? value : item.price_per_kg) || 0
        item.amount = Math.round(kg * price * 100) / 100
      }

      copy[index] = item
      return copy
    })
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      {
        description: '',
        weight_kg: 0,
        price_per_kg: 0,
        amount: 0,
      },
    ])
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0)
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
        open={true}
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
                className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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

        {/* Line Items Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Line Items
            </h4>
            <button
              type="button"
              onClick={addLineItem}
              className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Item
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Item Description</th>
                  <th className="w-24 px-3 py-2">Weight (kg)</th>
                  <th className="w-28 px-3 py-2">Price / kg (₹)</th>
                  <th className="w-28 px-3 py-2 text-right">Amount (₹)</th>
                  <th className="w-10 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {lineItems.map((item, index) => (
                  <tr key={index} className="bg-white dark:bg-slate-900">
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                        placeholder="Product name / size"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.weight_kg || ''}
                        onChange={(e) =>
                          handleLineChange(index, 'weight_kg', parseFloat(e.target.value) || 0)
                        }
                        placeholder="0"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={item.price_per_kg || ''}
                        onChange={(e) =>
                          handleLineChange(index, 'price_per_kg', parseFloat(e.target.value) || 0)
                        }
                        placeholder="₹/kg"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </td>
                    <td className="p-2 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                      ₹{(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-center">
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                className="w-24 rounded border border-slate-300 px-2 py-0.5 text-right text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600 dark:text-slate-400">Tax / GST (₹)</span>
              <input
                type="number"
                min="0"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                className="w-24 rounded border border-slate-300 px-2 py-0.5 text-right text-xs text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={createBill.isPending}
            onClick={handleSaveBill}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <Receipt className="h-4 w-4" />
            {createBill.isPending ? 'Generating Bill…' : 'Generate & Save Bill'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
