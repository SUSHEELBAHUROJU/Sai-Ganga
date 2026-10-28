import { useMemo, useState } from 'react'
import { Truck, ChevronRight, Search, SearchX, PiggyBank, Share2, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import {
  useSupplierLedgerBalances,
  useSupplierLedgerPeriod,
  supplierBalanceText,
  type PartyType,
} from '../../hooks/useSupplierLedger'
import { Chip } from '../../components/Chip'
import { LoadingState, EmptyState } from '../../components/States'
import { SupplierPassbookModal } from '../../components/SupplierPassbookModal'
import { DateRangeField } from '../../components/DateRangeField'
import { formatQty } from '../../lib/format'
import { formatShortDate, startOfMonth, todayISODate } from '../../lib/date'
import { generateSupplierLedgerReportBlob } from '../../lib/pdfGenerator'
import { useToast } from '../../lib/toast'

type SortMode = 'payable' | 'advance' | 'name' | 'activity'
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
  const { data: balances, isLoading: loadingBalances } = useSupplierLedgerBalances()
  const { showToast } = useToast()

  const [sortMode, setSortMode] = useState<SortMode>('payable')
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  // Date range filter
  const [isAll, setIsAll] = useState(true)
  const [fromDate, setFromDate] = useState(() => startOfMonth())
  const [toDate, setToDate] = useState(() => todayISODate())
  const [activeOnly, setActiveOnly] = useState(false)

  const { data: periodData, isLoading: loadingPeriod } = useSupplierLedgerPeriod(
    isAll ? null : fromDate,
    isAll ? null : toDate,
  )

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

  const activeInPeriodCount = useMemo(() => {
    if (isAll || !periodData) return (balances ?? []).length
    return (balances ?? []).filter((p) => {
      const act = periodData.partyActivity.get(keyOf(p))
      return act && act.count > 0
    }).length
  }, [balances, isAll, periodData])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = (balances ?? []).filter(
      (p) =>
        (partyFilter === 'all' || p.party_type === partyFilter) &&
        (p.is_active || p.balance !== 0) &&
        (!q || p.name.toLowerCase().includes(q) || (p.phone ?? '').includes(q)),
    )

    if (!isAll && activeOnly && periodData) {
      rows = rows.filter((p) => {
        const act = periodData.partyActivity.get(keyOf(p))
        return act && act.count > 0
      })
    }

    if (sortMode === 'payable') return rows.sort((a, b) => b.balance - a.balance)
    if (sortMode === 'advance') return rows.sort((a, b) => a.balance - b.balance)
    if (sortMode === 'activity' && periodData) {
      return rows.sort((a, b) => {
        const actA = (periodData.partyActivity.get(keyOf(a))?.purchased ?? 0) +
          (periodData.partyActivity.get(keyOf(a))?.paid ?? 0)
        const actB = (periodData.partyActivity.get(keyOf(b))?.purchased ?? 0) +
          (periodData.partyActivity.get(keyOf(b))?.paid ?? 0)
        return actB - actA
      })
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }, [balances, partyFilter, search, sortMode, isAll, activeOnly, periodData])

  async function handleShareFullLedger() {
    if (!balances || balances.length === 0) return
    setSharing(true)
    try {
      const periodLabel = isAll ? 'All Time' : `${formatShortDate(fromDate)} – ${formatShortDate(toDate)}`
      const { file, url, filename } = generateSupplierLedgerReportBlob(
        visible,
        isAll ? null : (periodData ?? null),
        periodLabel,
      )

      if (typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
        try {
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ title: `Supplier Ledger — ${periodLabel}`, files: [file] })
            return
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return
        }
      }

      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      showToast('Ledger report downloaded')
    } finally {
      setSharing(false)
    }
  }

  const isLoading = loadingBalances || (!isAll && loadingPeriod)

  return (
    <div className="space-y-5">
      {/* Date Range Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Ledger Date Filter
          </span>
          <button
            type="button"
            onClick={handleShareFullLedger}
            disabled={sharing || isLoading || visible.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Share2 className="h-3.5 w-3.5" />
            {sharing ? 'Preparing…' : isAll ? 'Share All' : 'Share Filtered'}
          </button>
        </div>

        <DateRangeField
          fromDate={fromDate}
          toDate={toDate}
          showAllOption
          isAll={isAll}
          allLabel="Pull All"
          onSelectAll={() => setIsAll(true)}
          onChange={(r) => {
            setIsAll(false)
            setFromDate(r.fromDate)
            setToDate(r.toDate)
          }}
          hideLimitNote
        />
      </div>

      {/* Summary Cards */}
      {isAll ? (
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
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <ArrowUpRight className="h-4 w-4 text-red-500" />
              <span>Purchased in Period</span>
            </div>
            <p className="mt-1 truncate text-lg font-bold text-red-600 dark:text-red-400">
              ₹{formatQty(periodData?.totalPurchased ?? 0)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <ArrowDownLeft className="h-4 w-4 text-green-500" />
              <span>Paid in Period</span>
            </div>
            <p className="mt-1 truncate text-lg font-bold text-green-600 dark:text-green-400">
              ₹{formatQty(periodData?.totalPaid ?? 0)}
            </p>
          </div>

          <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3 sm:col-span-1 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">You Owe (Overall)</p>
            <p className="mt-1 truncate text-lg font-bold text-slate-900 dark:text-slate-100">
              ₹{formatQty(totals.payable)}
            </p>
          </div>
        </div>
      )}

      {/* Search Input */}
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

      {/* Party Filter Chips */}
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

      {/* Sort / Range Filter Chips */}
      <div className="flex flex-wrap gap-2">
        <Chip label="Highest Payable" selected={sortMode === 'payable'} onClick={() => setSortMode('payable')} />
        <Chip label="Highest Advance" selected={sortMode === 'advance'} onClick={() => setSortMode('advance')} />
        <Chip label="A - Z" selected={sortMode === 'name'} onClick={() => setSortMode('name')} />
        {!isAll && (
          <>
            <Chip
              label="Most Active First"
              selected={sortMode === 'activity'}
              onClick={() => setSortMode('activity')}
            />
            <Chip
              label={`Active in Range (${activeInPeriodCount})`}
              selected={activeOnly}
              onClick={() => setActiveOnly(!activeOnly)}
            />
          </>
        )}
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

      {/* Supplier List */}
      <div className="space-y-2">
        {visible.map((p) => {
          const act = !isAll ? periodData?.partyActivity.get(keyOf(p)) : undefined
          return (
            <button
              key={keyOf(p)}
              type="button"
              onClick={() => setSelectedKey(keyOf(p))}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{PARTY_LABEL[p.party_type]}</span>
                  {p.phone && <span>· {p.phone}</span>}
                  {act && act.count > 0 && (
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      • Range: Purchased ₹{formatQty(act.purchased)} · Paid ₹{formatQty(act.paid)}
                    </span>
                  )}
                  {!isAll && (!act || act.count === 0) && (
                    <span className="italic text-slate-400 dark:text-slate-500">• No activity in range</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <BalanceTag balance={p.balance} />
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </div>
            </button>
          )
        })}
      </div>

      <SupplierPassbookModal
        open={selected !== null}
        party={selected}
        onClose={() => setSelectedKey(null)}
        initialRange={isAll ? null : { fromDate, toDate }}
      />
    </div>
  )
}
