import { useMemo, useState } from 'react'
import { Wallet, ChevronRight, Search, SearchX, Share2, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useCustomerLedgerBalances, useCustomerLedgerPeriod } from '../../hooks/useLedger'
import { Chip } from '../../components/Chip'
import { LoadingState, EmptyState } from '../../components/States'
import { CustomerPassbookModal } from '../../components/CustomerPassbookModal'
import { DateRangeField } from '../../components/DateRangeField'
import { formatQty } from '../../lib/format'
import { formatShortDate, startOfMonth, todayISODate } from '../../lib/date'
import { generateCustomerLedgerReportBlob } from '../../lib/pdfGenerator'
import { useToast } from '../../lib/toast'

type SortMode = 'due' | 'name' | 'activity'

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
    <span className="whitespace-nowrap text-sm font-bold text-green-600 dark:text-green-400">Fully Paid</span>
  )
}

export function CustomerLedgerView() {
  const { data: balances, isLoading: loadingBalances } = useCustomerLedgerBalances()
  const { showToast } = useToast()

  const [sortMode, setSortMode] = useState<SortMode>('due')
  const [search, setSearch] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  // Date range filter
  const [isAll, setIsAll] = useState(true)
  const [fromDate, setFromDate] = useState(() => startOfMonth())
  const [toDate, setToDate] = useState(() => todayISODate())
  const [activeOnly, setActiveOnly] = useState(false)

  const { data: periodData, isLoading: loadingPeriod } = useCustomerLedgerPeriod(
    isAll ? null : fromDate,
    isAll ? null : toDate,
  )

  const selectedCustomer = (balances ?? []).find((c) => c.customer_id === selectedCustomerId) ?? null

  const totalReceivables = useMemo(
    () => (balances ?? []).reduce((sum, c) => sum + Math.max(0, c.balance), 0),
    [balances],
  )

  const activeInPeriodCount = useMemo(() => {
    if (isAll || !periodData) return (balances ?? []).length
    return (balances ?? []).filter((c) => {
      const act = periodData.customerActivity.get(c.customer_id)
      return act && act.count > 0
    }).length
  }, [balances, isAll, periodData])

  const sorted = useMemo(() => {
    let rows = [...(balances ?? [])]

    if (!isAll && activeOnly && periodData) {
      rows = rows.filter((c) => {
        const act = periodData.customerActivity.get(c.customer_id)
        return act && act.count > 0
      })
    }

    if (sortMode === 'due') {
      return rows.sort((a, b) => b.balance - a.balance)
    }
    if (sortMode === 'activity' && periodData) {
      return rows.sort((a, b) => {
        const actA = (periodData.customerActivity.get(a.customer_id)?.due ?? 0) +
          (periodData.customerActivity.get(a.customer_id)?.received ?? 0)
        const actB = (periodData.customerActivity.get(b.customer_id)?.due ?? 0) +
          (periodData.customerActivity.get(b.customer_id)?.received ?? 0)
        return actB - actA
      })
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }, [balances, sortMode, isAll, activeOnly, periodData])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
  }, [sorted, search])

  async function handleShareFullLedger() {
    if (!balances || balances.length === 0) return
    setSharing(true)
    try {
      const periodLabel = isAll ? 'All Time' : `${formatShortDate(fromDate)} – ${formatShortDate(toDate)}`
      const { file, url, filename } = generateCustomerLedgerReportBlob(
        filtered,
        isAll ? null : (periodData ?? null),
        periodLabel,
      )

      if (typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
        try {
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ title: `Customer Ledger — ${periodLabel}`, files: [file] })
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
            Choose Dates
          </span>
          <button
            type="button"
            onClick={handleShareFullLedger}
            disabled={sharing || isLoading || filtered.length === 0}
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
          allLabel="Show All"
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
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
            <Wallet className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Outstanding
            </p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              ₹{formatQty(totalReceivables)}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <ArrowUpRight className="h-4 w-4 text-red-500" />
              <span>Bills in These Dates</span>
            </div>
            <p className="mt-1 truncate text-lg font-bold text-red-600 dark:text-red-400">
              ₹{formatQty(periodData?.totalDue ?? 0)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <ArrowDownLeft className="h-4 w-4 text-green-500" />
              <span>Received in These Dates</span>
            </div>
            <p className="mt-1 truncate text-lg font-bold text-green-600 dark:text-green-400">
              ₹{formatQty(periodData?.totalReceived ?? 0)}
            </p>
          </div>

          <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3 sm:col-span-1 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Outstanding</p>
            <p className="mt-1 truncate text-lg font-bold text-slate-900 dark:text-slate-100">
              ₹{formatQty(totalReceivables)}
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
          placeholder="Search customer by name or phone"
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      {/* Filter / Sort Chips */}
      <div className="flex flex-wrap gap-2">
        <Chip label="Most Due First" selected={sortMode === 'due'} onClick={() => setSortMode('due')} />
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

      {!isLoading && sorted.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No customers yet"
          hint="Add customers from a Sale or Settings, then track what they owe here."
        />
      )}

      {!isLoading && sorted.length > 0 && filtered.length === 0 && (
        <EmptyState icon={SearchX} title="No customers match that search or filter" />
      )}

      {/* Customer List */}
      <div className="space-y-2">
        {filtered.map((c) => {
          const act = !isAll ? periodData?.customerActivity.get(c.customer_id) : undefined
          return (
            <button
              key={c.customer_id}
              type="button"
              onClick={() => setSelectedCustomerId(c.customer_id)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{c.name}</p>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                  {c.phone && <span>{c.phone}</span>}
                  {act && act.count > 0 && (
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      • Range: Billed ₹{formatQty(act.due)} · Recv ₹{formatQty(act.received)}
                    </span>
                  )}
                  {!isAll && (!act || act.count === 0) && (
                    <span className="italic text-slate-400 dark:text-slate-500">• No activity in range</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <BalanceTag balance={c.balance} />
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </div>
            </button>
          )
        })}
      </div>

      <CustomerPassbookModal
        open={selectedCustomer !== null}
        customer={selectedCustomer}
        onClose={() => setSelectedCustomerId(null)}
        initialRange={isAll ? null : { fromDate, toDate }}
      />
    </div>
  )
}
