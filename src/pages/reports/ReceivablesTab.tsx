import { useMemo } from 'react'
import { useCustomerLedgerBalances, useCollectionsByMode } from '../../hooks/useLedger'
import { formatQty } from '../../lib/format'
import { LoadingState } from '../../components/States'

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-bold leading-tight ${accent ?? 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </p>
    </div>
  )
}

export function ReceivablesTab({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const { data: balances, isLoading: loadingBalances } = useCustomerLedgerBalances()
  const { data: collections, isLoading: loadingCollections } = useCollectionsByMode(fromDate, toDate)

  const customersWithDues = useMemo(
    () =>
      (balances ?? [])
        .filter((c) => c.balance > 0)
        .sort((a, b) => b.balance - a.balance),
    [balances],
  )

  const totalOutstanding = useMemo(
    () => customersWithDues.reduce((sum, c) => sum + c.balance, 0),
    [customersWithDues],
  )

  const isLoading = loadingBalances || loadingCollections

  return (
    <div className="space-y-4">
      {isLoading && <LoadingState />}

      {!isLoading && (
        <>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
              Total Outstanding
            </p>
            <p className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">
              ₹{formatQty(totalOutstanding)}
            </p>
            <p className="mt-0.5 text-xs text-red-600/80 dark:text-red-400/80">
              Across {customersWithDues.length} customer{customersWithDues.length === 1 ? '' : 's'}
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Collections — {fromDate === toDate ? 'this day' : 'this range'}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Cash" value={`₹${formatQty(collections?.cash_total ?? 0)}`} />
              <StatTile label="Online" value={`₹${formatQty(collections?.online_total ?? 0)}`} />
              <StatTile
                label="Total"
                value={`₹${formatQty(collections?.combined_total ?? 0)}`}
                accent="text-teal-600 dark:text-teal-400"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Customers With Dues
            </h3>
            {customersWithDues.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                No outstanding dues — everyone's settled up.
              </p>
            ) : (
              <div className="space-y-1">
                {customersWithDues.map((c) => (
                  <div
                    key={c.customer_id}
                    className="flex items-center justify-between gap-3 border-t border-slate-100 py-2 first:border-t-0 dark:border-slate-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {c.name}
                      </p>
                      {c.phone && (
                        <p className="truncate text-xs text-slate-400 dark:text-slate-500">{c.phone}</p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-sm font-bold text-red-600 dark:text-red-400">
                      ₹{formatQty(c.balance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
