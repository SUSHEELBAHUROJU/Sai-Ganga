import { useState } from 'react'
import { History, Pencil, SearchX, Trash2 } from 'lucide-react'
import {
  useRecords,
  groupRecordsByDate,
  describeRecord,
  describeRecordAmountText,
  RECORD_KIND_LABEL,
  type EntryRecord,
  type RecordKind,
} from '../hooks/useRecords'
import { useDeleteRecord } from '../hooks/useRecordMutations'
import { Chip } from '../components/Chip'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { AmountKgPcs } from '../components/AmountKgPcs'
import { EditRecordModal } from './records/EditRecordModal'
import { useToast } from '../lib/toast'
import {
  formatDateLabel,
  todayISODate,
  isoDateDaysAgo,
  clampRangeEnd,
  clampRangeStart,
  MAX_QUERY_RANGE_DAYS,
} from '../lib/date'
import { LoadingState, EmptyState } from '../components/States'

const ALL_KINDS = Object.keys(RECORD_KIND_LABEL) as RecordKind[]

// Same colors as the Home cards and nav icons — production blue, sale green,
// recycling teal, purchase orange — so a tag reads by color before the label
// does, everywhere the concept appears.
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

  const { data: records, isLoading } = useRecords({ fromDate, toDate, kinds })
  const deleteRecord = useDeleteRecord()
  const { showToast } = useToast()

  const groups = groupRecordsByDate(records ?? [])

  function toggleKind(kind: RecordKind) {
    setKinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]))
  }

  function applyPreset(days: number) {
    setFromDate(isoDateDaysAgo(days))
    setToDate(today)
  }

  /** Tapping a date header isolates that single day. */
  function jumpToDay(date: string) {
    setFromDate(date)
    setToDate(date)
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

  const isSingleDay = fromDate === toDate
  // Distinguishes "your filters hid everything" from "you haven't logged anything yet".
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Ranges are limited to {MAX_QUERY_RANGE_DAYS} days at a time.
        </p>

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
        groups.length === 0 &&
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

      <div className="space-y-5">
        {groups.map(([date, dayRecords]) => (
          <div key={date}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {formatDateLabel(date)}
              </h3>
              {!isSingleDay && (
                <button
                  type="button"
                  onClick={() => jumpToDay(date)}
                  className="-mr-2 rounded-lg px-2 py-2 text-xs font-medium text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
                >
                  View this day
                </button>
              )}
            </div>

            <div className="space-y-2">
              {dayRecords.map((record) => {
                const { title, subtitle, amount, amountKgPcs } = describeRecord(record)
                return (
                  <div
                    key={`${record.kind}:${record.row.id}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_BADGE[record.kind]}`}
                        >
                          {RECORD_KIND_LABEL[record.kind]}
                        </span>
                        <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {title}
                        </span>
                      </div>
                      {subtitle && (
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {subtitle}
                        </p>
                      )}

                      {record.row.notes && (
                        <p className="mt-0.5 truncate text-xs italic text-slate-400 dark:text-slate-500">
                          {record.row.notes}
                        </p>
                      )}
                    </div>

                    <span className="shrink-0 text-sm">
                      {amountKgPcs ? (
                        <AmountKgPcs kg={amountKgPcs.kg} pcs={amountKgPcs.pcs} />
                      ) : (
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {amount}
                        </span>
                      )}
                    </span>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${RECORD_KIND_LABEL[record.kind]} entry`}
                        onClick={() => setEditing(record)}
                        className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${RECORD_KIND_LABEL[record.kind]} entry`}
                        onClick={() => setDeleting(record)}
                        className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <EditRecordModal record={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete entry?"
        message={
          deleting
            ? `Permanently delete this ${RECORD_KIND_LABEL[deleting.kind].toLowerCase()} entry of ${describeRecordAmountText(deleting)}? Stock will be recalculated without it.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
