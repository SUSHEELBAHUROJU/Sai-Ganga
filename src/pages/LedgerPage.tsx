import { useState } from 'react'
import { CustomerLedgerView } from './ledger/CustomerLedgerView'
import { SupplierLedgerView } from './ledger/SupplierLedgerView'

type Side = 'customers' | 'suppliers'

const SIDES: { value: Side; label: string }[] = [
  { value: 'customers', label: 'Customers' },
  { value: 'suppliers', label: 'Suppliers' },
]

export function LedgerPage() {
  const [side, setSide] = useState<Side>('customers')

  return (
    <div className="space-y-5 pb-4">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Ledger</h2>

      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-800">
        {SIDES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSide(s.value)}
            className={`min-h-[48px] flex-1 rounded-xl text-base font-bold transition-colors ${
              side === s.value
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {side === 'customers' ? <CustomerLedgerView /> : <SupplierLedgerView />}
    </div>
  )
}
