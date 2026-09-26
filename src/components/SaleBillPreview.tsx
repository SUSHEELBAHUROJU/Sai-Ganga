import { formatDateLabel } from '../lib/date'
import { formatQty } from '../lib/format'
import { saleLineAmount, saleLineKg, type SaleLine } from '../lib/saleBill'

type SaleBillPreviewProps = {
  billNumber: string | null
  billDate: string
  customer: { name: string; phone: string | null; address: string | null } | null
  lines: SaleLine[]
  /** One rate per kg for every pipe on the bill. */
  rate: number
  transport: number
  discount: number
  tax: number
  notes: string
}

const rupees = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * The bill as it will be generated, laid out for a phone rather than as the
 * A4 PDF — a PDF preview doesn't render inline in most mobile browsers, and
 * this step is about checking the figures before anything is saved.
 */
export function SaleBillPreview({
  billNumber,
  billDate,
  customer,
  lines,
  rate,
  transport,
  discount,
  tax,
  notes,
}: SaleBillPreviewProps) {
  const itemsTotal = lines.reduce((sum, l) => sum + saleLineAmount(l, rate), 0)
  const grandTotal = Math.max(0, itemsTotal - discount + tax + transport)
  const totalPcs = lines.reduce((sum, l) => sum + l.quantity, 0)
  const totalKg = lines.reduce((sum, l) => sum + saleLineKg(l), 0)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Bill To</p>
          <p className="truncate font-bold text-slate-900 dark:text-slate-100">{customer?.name ?? '—'}</p>
          {(customer?.phone || customer?.address) && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {[customer.phone, customer.address].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">{billNumber ?? '…'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateLabel(billDate)}</p>
        </div>
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {lines.map((line, idx) => {
          const kg = saleLineKg(line)
          return (
            <li key={line.localId} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  <span className="mr-1.5 text-xs text-slate-400">{idx + 1}.</span>
                  {line.label}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatQty(line.quantity)} pcs · {formatQty(kg)} kg × ₹{formatQty(rate)}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                ₹{rupees(saleLineAmount(line, rate))}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="space-y-1.5 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
        <div className="flex justify-between text-slate-600 dark:text-slate-400">
          <span>
            Items total <span className="text-xs">({formatQty(totalPcs)} pcs · {formatQty(totalKg)} kg)</span>
          </span>
          <span className="font-mono text-slate-900 dark:text-slate-100">₹{rupees(itemsTotal)}</span>
        </div>
        {transport > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Transport</span>
            <span className="font-mono text-slate-900 dark:text-slate-100">+ ₹{rupees(transport)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Discount</span>
            <span className="font-mono text-slate-900 dark:text-slate-100">− ₹{rupees(discount)}</span>
          </div>
        )}
        {tax > 0 && (
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>GST</span>
            <span className="font-mono text-slate-900 dark:text-slate-100">+ ₹{rupees(tax)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-slate-200 pt-2 dark:border-slate-800">
          <span className="font-bold text-slate-900 dark:text-slate-100">Grand Total</span>
          <span className="font-mono text-xl font-bold text-teal-600 dark:text-teal-400">₹{rupees(grandTotal)}</span>
        </div>
      </div>

      {notes.trim() && (
        <p className="border-t border-slate-200 px-4 py-2.5 text-xs italic text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Note: {notes.trim()}
        </p>
      )}
    </div>
  )
}
