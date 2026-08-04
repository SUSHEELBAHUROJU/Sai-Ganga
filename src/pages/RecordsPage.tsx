import { useState } from 'react'
import { History, Pencil, SearchX, Trash2, Receipt, ChevronDown, ChevronUp, Layers } from 'lucide-react'
import {
  useRecords,
  groupRecordsByTransaction,
  describeRecord,
  describeRecordAmountText,
  RECORD_KIND_LABEL,
  type EntryRecord,
  type RecordKind,
  type SaleRecordRow,
  type GroupedTransaction,
} from '../hooks/useRecords'
import { useDeleteRecord } from '../hooks/useRecordMutations'
import { useBill } from '../hooks/useBills'
import { useBillPaymentStatuses } from '../hooks/useLedger'
import { Chip } from '../components/Chip'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { AmountKgPcs } from '../components/AmountKgPcs'
import { EditRecordModal } from './records/EditRecordModal'
import { CreateBillModal } from '../components/CreateBillModal'
import { EditBillModal } from '../components/EditBillModal'
import { BillPdfModal } from '../components/BillPdfModal'
import { useToast } from '../lib/toast'
import {
  formatDateLabel,
  todayISODate,
  isoDateDaysAgo,
  clampRangeEnd,
  clampRangeStart,
  MAX_QUERY_RANGE_DAYS,
} from '../lib/date'
import { formatPipeProductLabel, piecesToKg, formatQty } from '../lib/format'
import { LoadingState, EmptyState } from '../components/States'

const ALL_KINDS = Object.keys(RECORD_KIND_LABEL) as RecordKind[]

const KIND_BADGE: Record<RecordKind, string> = {
  production: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  sale: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
  recycling: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
  raw_material_purchase: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  scrap_purchase: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  factory_waste: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
}

const RANGE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Last 7 days', days: 6 },
  { label: 'Last 30 days', days: 29 },
]

export function RecordsPage() {
  const today = todayISODate()
  const [fromDate, setFromDate] = useState(isoDateDaysAgo(6))
  const [toDate, setToDate] = useState(today)
  const [kinds, setKinds] = useState<RecordKind[]>([])

  const [editing, setEditing] = useState<EntryRecord | null>(null)
  const [deleting, setDeleting] = useState<EntryRecord | null>(null)

  // Track collapsed groups (true = collapsed)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  // Billing state
  const [createBillModalData, setCreateBillModalData] = useState<{
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
  } | null>(null)

  const [selectedBillId, setSelectedBillId] = useState<string | null>(null)
  const [editingBillId, setEditingBillId] = useState<string | null>(null)
  const { data: activeViewBill } = useBill(selectedBillId)
  const { data: activeEditBill } = useBill(editingBillId)

  const { data: recordsResult, isLoading } = useRecords({ fromDate, toDate, kinds })
  const deleteRecord = useDeleteRecord()
  const { showToast } = useToast()
  const { data: billStatuses } = useBillPaymentStatuses()

  const transactionGroups = groupRecordsByTransaction(recordsResult?.records ?? [])

  function toggleKind(kind: RecordKind) {
    setKinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]))
  }

  function applyPreset(days: number) {
    setFromDate(isoDateDaysAgo(days))
    setToDate(today)
  }

  function jumpToDay(date: string) {
    setFromDate(date)
    setToDate(date)
  }

  function toggleGroupCollapse(groupId: string) {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  function handleDelete() {
    if (!deleting) return
    deleteRecord.mutate(
      { kind: deleting.kind, id: deleting.row.id },
      {
        onSuccess: () => {
          showToast(`${RECORD_KIND_LABEL[deleting.kind]} entry deleted`)
          setDeleting(null)
        },
        onError: () => showToast('Could not delete entry', 'error'),
      },
    )
  }

  function handleCreateBillForGroup(group: GroupedTransaction) {
    const saleRows = group.items.map((i) => i.row as SaleRecordRow)
    const saleEntryIds = saleRows.map((s) => s.id)
    const lines = saleRows.map((s) => {
      const p = s.pipe_products
      const label = p ? formatPipeProductLabel(p.diameter_inches, p.weight_kg) : 'Pipe Product'
      const kg = p ? piecesToKg(s.quantity, p.weight_kg) : 0
      return {
        pipeProductId: s.pipe_product_id,
        description: label,
        weightKg: kg,
        quantityPcs: s.quantity,
      }
    })

    const firstSale = saleRows[0]
    setCreateBillModalData({
      saleEntryIds,
      entryDate: group.date,
      customerId: firstSale?.customer_id || null,
      customerName: firstSale?.customers?.name || group.title || 'Cash Customer',
      lines,
    })
  }

  const isSingleDay = fromDate === toDate
  const isFiltered = kinds.length > 0 || fromDate !== isoDateDaysAgo(6) || toDate !== today

  function resetFilters() {
    setKinds([])
    applyPreset(6)
  }

  return (
    <div className="space-y-5 pb-4">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Records</h2>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-2">
          {RANGE_PRESETS.map((preset) => (
            <Chip
              key={preset.label}
              label={preset.label}
              selected={fromDate === isoDateDaysAgo(preset.days) && toDate === today}
              onClick={() => applyPreset(preset.days)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="mb-1 block">From</span>
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => {
                const next = e.target.value
                setFromDate(next)
                setToDate((prev) => clampRangeEnd(next, prev))
              }}
              className="min-h-[44px] min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="mb-1 block">To</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={today}
              onChange={(e) => {
                const next = e.target.value
                setToDate(next)
                setFromDate((prev) => clampRangeStart(prev, next))
              }}
              className="min-h-[44px] min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Ranges are limited to {MAX_QUERY_RANGE_DAYS} days at a time.
        </p>
        {recordsResult?.truncated && (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            This range has a lot of activity — showing the most recent 1000 entries per type. Narrow
            the date range or type filter to see everything.
          </p>
        )}

        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Type
          </span>
          <div className="flex flex-wrap gap-2">
            <Chip label="All" selected={kinds.length === 0} onClick={() => setKinds([])} />
            {ALL_KINDS.map((kind) => (
              <Chip
                key={kind}
                label={RECORD_KIND_LABEL[kind]}
                selected={kinds.includes(kind)}
                onClick={() => toggleKind(kind)}
              />
            ))}
          </div>
        </div>
      </div>

      {isLoading && <LoadingState />}

      {!isLoading &&
        transactionGroups.length === 0 &&
        (isFiltered ? (
          <EmptyState
            icon={SearchX}
            title="No entries match these filters"
            hint="Try widening the date range or clearing the type filter."
            actionLabel="Reset filters"
            onAction={resetFilters}
          />
        ) : (
          <EmptyState
            icon={History}
            title="No entries yet"
            hint="Once you log production, sales, purchases or recycling, they'll show up here to review or correct."
            actionLabel="Add your first production"
            actionTo="/production/add"
          />
        ))}

      <div className="space-y-6">
        {transactionGroups.map(([date, groups]) => (
          <div key={date}>
            <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {formatDateLabel(date)}
              </h3>
              {!isSingleDay && (
                <button
                  type="button"
                  onClick={() => jumpToDay(date)}
                  className="-mr-2 flex min-h-[44px] shrink-0 items-center rounded-lg px-2 text-xs font-medium text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
                >
                  View this day
                </button>
              )}
            </div>

            <div className="space-y-3 pt-1">
              {groups.map((group) => {
                const isMultiItem = group.items.length > 1
                const isCollapsed = Boolean(collapsedGroups[group.id])
                const isSale = group.kind === 'sale'
                const saleBill = group.bill

                return (
                  <div
                    key={group.id}
                    className="rounded-xl border border-slate-200 bg-white shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900"
                  >
                    {/* Group Card Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4">
                      <div className="flex flex-wrap items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${KIND_BADGE[group.kind]}`}
                        >
                          {RECORD_KIND_LABEL[group.kind]}
                        </span>

                        <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                          {group.title}
                        </span>

                        {isMultiItem && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            <Layers className="h-3 w-3" />
                            {group.items.length} items
                          </span>
                        )}

                        {/* Bill Badges & Edit Bill Action on Sales Group */}
                        {isSale && (
                          saleBill ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedBillId(saleBill.id)}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded-md bg-teal-100 px-2.5 py-1 font-mono text-xs font-bold text-teal-800 hover:bg-teal-200 dark:bg-teal-950/80 dark:text-teal-300 dark:hover:bg-teal-900"
                              >
                                <Receipt className="h-3.5 w-3.5" />
                                {saleBill.bill_number}
                              </button>
                              {saleBill.status === 'active' && billStatuses?.get(saleBill.id) && (
                                <span
                                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                    billStatuses.get(saleBill.id)!.payment_status === 'paid'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300'
                                      : billStatuses.get(saleBill.id)!.payment_status === 'partial'
                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                        : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                                  }`}
                                >
                                  {billStatuses.get(saleBill.id)!.payment_status}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditingBillId(saleBill.id)}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit Bill
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCreateBillForGroup(group)}
                              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
                            >
                              <Receipt className="h-3.5 w-3.5" />
                              + Create Bill
                            </button>
                          )
                        )}
                      </div>

                      {/* Header Right Side (Total + Expand Toggle) */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          {group.totalPcs > 0 ? (
                            <AmountKgPcs kg={group.totalKg} pcs={group.totalPcs} />
                          ) : (
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                              {formatQty(group.totalKg)} kg
                            </span>
                          )}
                        </div>

                        {isMultiItem && (
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapse(group.id)}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            aria-label="Toggle group items"
                          >
                            {isCollapsed ? (
                              <ChevronDown className="h-5 w-5" />
                            ) : (
                              <ChevronUp className="h-5 w-5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Group Items Detail List */}
                    {(!isCollapsed || !isMultiItem) && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-2 sm:p-3 dark:border-slate-800/80 dark:bg-slate-950/40 rounded-b-xl space-y-1.5">
                        {group.items.map((item) => {
                          const { title: itemTitle, subtitle: itemSub, amount, amountKgPcs } = describeRecord(item)

                          return (
                            <div
                              key={`${item.kind}:${item.row.id}`}
                              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900"
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {isMultiItem ? itemTitle : group.subtitle || itemTitle}
                                </span>

                                {isMultiItem && itemSub && (
                                  <span className="ml-2 text-slate-400 dark:text-slate-500">
                                    ({itemSub})
                                  </span>
                                )}

                                {item.row.notes && (
                                  <p className="truncate italic text-slate-400 dark:text-slate-500">
                                    {item.row.notes}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {amountKgPcs ? (
                                    <AmountKgPcs kg={amountKgPcs.kg} pcs={amountKgPcs.pcs} />
                                  ) : (
                                    amount
                                  )}
                                </span>

                                <div className="-mr-1 ml-1 flex items-center">
                                  <button
                                    type="button"
                                    aria-label={`Edit ${RECORD_KIND_LABEL[item.kind]} entry`}
                                    onClick={() => setEditing(item)}
                                    className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Delete ${RECORD_KIND_LABEL[item.kind]} entry`}
                                    onClick={() => setDeleting(item)}
                                    className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <EditRecordModal record={editing} onClose={() => setEditing(null)} />

      <CreateBillModal
        open={createBillModalData !== null}
        onClose={() => setCreateBillModalData(null)}
        initialData={createBillModalData ?? undefined}
      />

      <BillPdfModal
        open={selectedBillId !== null}
        bill={activeViewBill ?? null}
        onClose={() => setSelectedBillId(null)}
        onEditBill={(b) => setEditingBillId(b.id)}
      />

      <EditBillModal
        open={editingBillId !== null}
        bill={activeEditBill ?? null}
        onClose={() => setEditingBillId(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting ? RECORD_KIND_LABEL[deleting.kind] : ''}?`}
        message={
          deleting
            ? `Are you sure you want to delete this ${RECORD_KIND_LABEL[deleting.kind]} entry (${describeRecordAmountText(deleting)})? This will reverse the stock adjustments made by this entry.`
            : ''
        }
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
