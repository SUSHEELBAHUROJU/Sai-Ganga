import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { DateField } from '../../components/DateField'
import { useMoveEntriesDate } from '../../hooks/useRecordMutations'
import { useProductionEntriesByDate } from '../../hooks/useProductionEntries'
import { describeRecord, RECORD_KIND_LABEL, type EntryRecord } from '../../hooks/useRecords'
import { useToast } from '../../lib/toast'
import { formatDateLabel, isoDateFromDate } from '../../lib/date'
import { formatQty } from '../../lib/format'

type ChangeEntriesDateModalProps = {
  /** The day the entries currently sit on. */
  date: string
  /** Every production / recycling entry on that day — the user picks which move. */
  candidates: EntryRecord[]
  /** Pre-ticked: the group the user opened this from. */
  initialSelectedIds: string[]
  onClose: () => void
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return isoDateFromDate(d)
}

export function ChangeEntriesDateModal({
  date,
  candidates,
  initialSelectedIds,
  onClose,
}: ChangeEntriesDateModalProps) {
  const moveEntries = useMoveEntriesDate()
  const { showToast } = useToast()

  // Usual case is output logged the morning after — start on the day before.
  const [newDate, setNewDate] = useState(() => dayBefore(date))
  const [selected, setSelected] = useState(() => new Set(initialSelectedIds))

  // What the target day already holds, so merges are visible before saving.
  const { data: targetProduction } = useProductionEntriesByDate(newDate)
  const existingQtyByProduct = useMemo(
    () => new Map((targetProduction ?? []).map((e) => [e.pipe_product_id, e.quantity])),
    [targetProduction],
  )

  const selectedRecords = candidates.filter((c) => selected.has(c.row.id))
  const allSelected = selected.size === candidates.length
  const sameDate = newDate === date

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSave() {
    if (sameDate || selectedRecords.length === 0) return
    moveEntries.mutate(
      {
        productionIds: selectedRecords.filter((r) => r.kind === 'production').map((r) => r.row.id),
        recyclingIds: selectedRecords.filter((r) => r.kind === 'recycling').map((r) => r.row.id),
        newDate,
      },
      {
        onSuccess: ({ moved, merged }) => {
          showToast(
            `Moved ${moved} ${moved === 1 ? 'entry' : 'entries'} to ${formatDateLabel(newDate)}` +
              (merged > 0 ? ` — ${merged} added to existing entries` : ''),
          )
          onClose()
        },
        onError: () => showToast('Could not change the date', 'error'),
      },
    )
  }

  return (
    <Modal title="Change Date" open onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Entries currently on{' '}
          <span className="font-semibold text-slate-900 dark:text-slate-100">{formatDateLabel(date)}</span>.
          Tick the ones to move.
        </p>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Move to</span>
          <DateField value={newDate} onChange={setNewDate} />
          {sameDate && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">Pick a different date.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {selected.size} of {candidates.length} selected
            </span>
            <button
              type="button"
              onClick={() => setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.row.id)))}
              className="min-h-[44px] rounded-lg px-2 text-xs font-semibold text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>

          {candidates.map((record) => {
            const { title, amount } = describeRecord(record)
            const isChecked = selected.has(record.row.id)
            const existingQty =
              record.kind === 'production' && !sameDate
                ? existingQtyByProduct.get(record.row.pipe_product_id)
                : undefined
            const mergedQty =
              existingQty !== undefined && record.kind === 'production'
                ? existingQty + record.row.quantity
                : null
            return (
              <button
                key={`${record.kind}:${record.row.id}`}
                type="button"
                onClick={() => toggle(record.row.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left ${
                  isChecked
                    ? 'border-teal-500 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/40'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                    isChecked ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {isChecked && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {RECORD_KIND_LABEL[record.kind]} · {amount}
                  </span>
                  {isChecked && existingQty !== undefined && mergedQty !== null && (
                    <span className="block text-xs font-medium text-amber-700 dark:text-amber-400">
                      {formatDateLabel(newDate)} already has {formatQty(existingQty)} pcs — will become{' '}
                      {formatQty(mergedQty)} pcs
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={moveEntries.isPending || sameDate || selectedRecords.length === 0}
          className="w-full rounded-lg bg-teal-600 py-3 text-base font-bold text-white hover:bg-teal-700 disabled:opacity-40"
        >
          {moveEntries.isPending
            ? 'Moving…'
            : `Move ${selectedRecords.length} ${selectedRecords.length === 1 ? 'entry' : 'entries'} to ${formatDateLabel(newDate)}`}
        </button>
      </div>
    </Modal>
  )
}
