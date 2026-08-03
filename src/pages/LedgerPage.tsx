import { useMemo, useState } from 'react'
import { Wallet, ChevronRight, Search, SearchX } from 'lucide-react'
import { useCustomerLedgerBalances, type CustomerLedgerBalance } from '../hooks/useLedger'
import { Chip } from '../components/Chip'
import { LoadingState, EmptyState } from '../components/States'
import { CustomerPassbookModal } from '../components/CustomerPassbookModal'
import { formatQty } from '../lib/format'

type SortMode = 'due' | 'name'

function BalanceTag({ balance }: { balance: number }) {
  if (balance > 0) {
    return (
      <span className="whitespace-nowrap font-mono text-sm font-bold text-red-600 dark:text-red-400">
        ₹{formatQty(balance)} Due
      </span>
    )
  }
  if (balance < 0) {
    return (
      <span className="whitespace-nowrap font-mono text-sm font-bold text-teal-600 dark:text-teal-400">
        ₹{formatQty(-balance)} Advance
      </span>
    )
  }
  return (
    <span className="whitespace-nowrap text-sm font-bold text-green-600 dark:text-green-400">Settled</span>
  )
}

export function LedgerPage() {
  const { data: balances, isLoading } = useCustomerLedgerBalances()
  const [sortMode, setSortMode] = useState<SortMode>('due')
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLedgerBalance | null>(null)

  const totalReceivables = useMemo(
    () => (balances ?? []).reduce((sum, c) => sum + Math.max(0, c.balance), 0),
    [balances],
  )

  const sorted = useMemo(() => {
    const rows = [...(balances ?? [])]
    if (sortMode === 'due') {
      return rows.sort((a, b) => b.balance - a.balance)
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }, [balances, sortMode])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
  }, [sorted, search])

  return (
    <div className="space-y-5 pb-4">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Ledger</h2>

      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
          <Wallet className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total You Are Owed
          </p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            ₹{formatQty(totalReceivables)}
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer by name or phone"
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip label="Highest Due First" selected={sortMode === 'due'} onClick={() => setSortMode('due')} />
        <Chip label="A - Z" selected={sortMode === 'name'} onClick={() => setSortMode('name')} />
      </div>

      {isLoading && <LoadingState />}

      {!isLoading && sorted.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No customers yet"
          hint="Add customers from a Sale or Settings, then track what they owe here."
        />
      )}

      {!isLoading && sorted.length > 0 && filtered.length === 0 && (
        <EmptyState icon={SearchX} title="No customers match that search" />
      )}

      <div className="space-y-2">
        {filtered.map((c) => (
          <button
            key={c.customer_id}
            type="button"
            onClick={() => setSelectedCustomer(c)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{c.name}</p>
              {c.phone && (
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{c.phone}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <BalanceTag balance={c.balance} />
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </div>
          </button>
        ))}
      </div>

      <CustomerPassbookModal
        open={selectedCustomer !== null}
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
      />
    </div>
  )
}
