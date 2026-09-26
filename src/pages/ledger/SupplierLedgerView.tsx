import { useMemo, useState } from 'react'
import { Truck, ChevronRight, Search, SearchX, PiggyBank } from 'lucide-react'
import {
  useSupplierLedgerBalances,
  supplierBalanceText,
  type PartyType,
} from '../../hooks/useSupplierLedger'
import { Chip } from '../../components/Chip'
import { LoadingState, EmptyState } from '../../components/States'
import { SupplierPassbookModal } from '../../components/SupplierPassbookModal'
import { formatQty } from '../../lib/format'

type SortMode = 'payable' | 'advance' | 'name'
type PartyFilter = 'all' | PartyType

const PARTY_LABEL: Record<PartyType, string> = {
  supplier: 'Raw Material',
  scrap_dealer: 'Scrap Dealer',
}

function BalanceTag({ balance }: { balance: number }) {
  const color =
    balance > 0
      ? 'text-red-600 dark:text-red-400'
      : balance < 0
        ? 'text-teal-600 dark:text-teal-400'
        : 'text-green-600 dark:text-green-400'
  return (
    <span className={`whitespace-nowrap font-mono text-sm font-bold ${color}`}>
      {supplierBalanceText(balance, formatQty)}
    </span>
  )
}

export function SupplierLedgerView() {
  const { data: balances, isLoading } = useSupplierLedgerBalances()
  const [sortMode, setSortMode] = useState<SortMode>('payable')
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('all')
  const [search, setSearch] = useState('')
  // Keep only the key and read the party from the live list, so the passbook's
  // balance card updates as soon as a payment is saved.
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const keyOf = (p: { party_type: PartyType; party_id: string }) => `${p.party_type}:${p.party_id}`
  const selected = (balances ?? []).find((p) => keyOf(p) === selectedKey) ?? null

  const totals = useMemo(() => {
    let payable = 0
    let advance = 0
    for (const p of balances ?? []) {
      if (p.balance > 0) payable += p.balance
      else advance -= p.balance
    }
    return { payable, advance }
  }, [balances])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = (balances ?? []).filter(
      (p) =>
        (partyFilter === 'all' || p.party_type === partyFilter) &&
        // Inactive parties drop out of the list once nothing is outstanding.
        (p.is_active || p.balance !== 0) &&
        (!q || p.name.toLowerCase().includes(q) || (p.phone ?? '').includes(q)),
    )
    if (sortMode === 'payable') return rows.sort((a, b) => b.balance - a.balance)
    if (sortMode === 'advance') return rows.sort((a, b) => a.balance - b.balance)
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }, [balances, partyFilter, search, sortMode])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
            <Truck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">You Owe Suppliers</p>
            <p className="truncate text-lg font-bold text-red-600 dark:text-red-400">
              ₹{formatQty(totals.payable)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
            <PiggyBank className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Advance With Them</p>
            <p className="truncate text-lg font-bold text-teal-600 dark:text-teal-400">
              ₹{formatQty(totals.advance)}
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search supplier by name or phone"
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip label="All" selected={partyFilter === 'all'} onClick={() => setPartyFilter('all')} />
        <Chip
          label="Raw Material"
          selected={partyFilter === 'supplier'}
          onClick={() => setPartyFilter('supplier')}
        />
        <Chip
          label="Scrap Dealers"
          selected={partyFilter === 'scrap_dealer'}
          onClick={() => setPartyFilter('scrap_dealer')}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip label="Highest Payable" selected={sortMode === 'payable'} onClick={() => setSortMode('payable')} />
        <Chip label="Highest Advance" selected={sortMode === 'advance'} onClick={() => setSortMode('advance')} />
        <Chip label="A - Z" selected={sortMode === 'name'} onClick={() => setSortMode('name')} />
      </div>

      {isLoading && <LoadingState />}

      {!isLoading && (balances ?? []).length === 0 && (
        <EmptyState
          icon={Truck}
          title="No suppliers yet"
          hint="Add suppliers or scrap dealers from a Purchase or Settings, then track payments here."
        />
      )}

      {!isLoading && (balances ?? []).length > 0 && visible.length === 0 && (
        <EmptyState icon={SearchX} title="No suppliers match" />
      )}

      <div className="space-y-2">
        {visible.map((p) => (
          <button
            key={keyOf(p)}
            type="button"
            onClick={() => setSelectedKey(keyOf(p))}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {PARTY_LABEL[p.party_type]}
                {p.phone ? ` · ${p.phone}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <BalanceTag balance={p.balance} />
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </div>
          </button>
        ))}
      </div>

      <SupplierPassbookModal open={selected !== null} party={selected} onClose={() => setSelectedKey(null)} />
    </div>
  )
}
