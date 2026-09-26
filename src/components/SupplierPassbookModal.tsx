import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { ConfirmDialog } from './ConfirmDialog'
import { SupplierPaymentModal } from './SupplierPaymentModal'
import { Trash2, Receipt, Share2 } from 'lucide-react'
import {
  useSupplierPassbook,
  useDeleteSupplierLedgerEntry,
  supplierBalanceText,
  SUPPLIER_PAYMENT_MODE_LABEL,
  type SupplierEntryType,
  type SupplierLedgerBalance,
  type SupplierPassbookEntry,
} from '../hooks/useSupplierLedger'
import { LoadingState, EmptyNote } from './States'
import { useToast } from '../lib/toast'
import { formatDateLabel } from '../lib/date'
import { formatQty } from '../lib/format'
import { generateSupplierStatementBlob } from '../lib/pdfGenerator'

type SupplierPassbookModalProps = {
  open: boolean
  party: SupplierLedgerBalance | null
  onClose: () => void
}

function balanceColor(balance: number): string {
  return balance > 0
    ? 'text-red-600 dark:text-red-400'
    : balance < 0
      ? 'text-teal-600 dark:text-teal-400'
      : 'text-green-600 dark:text-green-400'
}

function entryTitle(entry: SupplierPassbookEntry): string {
  switch (entry.kind) {
    case 'purchase':
      return `Purchase · ${entry.item_name ?? 'Material'}`
    case 'payment': {
      const mode = entry.payment_mode ? SUPPLIER_PAYMENT_MODE_LABEL[entry.payment_mode] : 'Payment'
      return entry.paid_to ? `Paid · ${mode} → ${entry.paid_to}` : `Paid · ${mode}`
    }
    case 'refund':
      return 'Refund Received'
    case 'due':
      return 'Opening / Manual Due'
  }
}

function entryDetail(entry: SupplierPassbookEntry): string | null {
  if (entry.kind === 'purchase') {
    const qty = entry.quantity_kg != null ? `${formatQty(entry.quantity_kg)} kg` : null
    const rate = entry.price_per_kg != null ? `@ ₹${formatQty(entry.price_per_kg)}/kg` : null
    return [qty, rate].filter(Boolean).join(' ') || null
  }
  const parts = [
    entry.reference_no ? `Ref ${entry.reference_no}` : null,
    entry.bank_account,
    entry.paid_by ? `by ${entry.paid_by}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

function TransactionRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: SupplierPassbookEntry
  onEdit: (entry: SupplierPassbookEntry) => void
  onDelete: (entry: SupplierPassbookEntry) => void
}) {
  const isPurchase = entry.kind === 'purchase'
  // What the factory owes goes up (purchase, due, refund) in red; payments in green.
  const raisesBalance = entry.kind !== 'payment'
  const detail = entryDetail(entry)
  const amountLabel = { purchase: 'Purchase', payment: 'Paid', refund: 'Refund', due: 'Due' }[entry.kind]

  const body = (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entryTitle(entry)}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {formatDateLabel(entry.entry_date)}
        {detail ? ` · ${detail}` : ''}
      </p>
      {entry.note && (
        <p className="mt-0.5 truncate text-xs italic text-slate-400 dark:text-slate-500">{entry.note}</p>
      )}
    </div>
  )

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200/70 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      {isPurchase ? (
        body
      ) : (
        // Payments / dues / refunds open for editing; purchases are edited from Records.
        <button type="button" onClick={() => onEdit(entry)} className="min-w-0 flex-1 text-left">
          {body}
        </button>
      )}
      <div className="flex shrink-0 items-center gap-2 text-right">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {amountLabel}
          </p>
          <p
            className={`font-mono text-sm font-bold ${raisesBalance ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
          >
            ₹{formatQty(entry.amount)}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Bal: {supplierBalanceText(entry.running_balance, formatQty)}
          </p>
        </div>
        {!isPurchase && (
          <button
            type="button"
            aria-label="Delete entry"
            onClick={() => onDelete(entry)}
            className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

export function SupplierPassbookModal({ open, party, onClose }: SupplierPassbookModalProps) {
  const { data: entries, isLoading } = useSupplierPassbook(party?.party_type ?? null, party?.party_id ?? null)
  const deleteEntry = useDeleteSupplierLedgerEntry()
  const { showToast } = useToast()

  const [entryModal, setEntryModal] = useState<{
    editing: SupplierPassbookEntry | null
    initialType: SupplierEntryType
  } | null>(null)
  const [deleting, setDeleting] = useState<SupplierPassbookEntry | null>(null)
  const [sharing, setSharing] = useState(false)

  // Most recent first — the friend paid last week is the likeliest next payee.
  const knownPayees = useMemo(() => {
    const names = (entries ?? []).map((e) => e.paid_to?.trim()).filter((n): n is string => Boolean(n))
    return Array.from(new Set(names))
  }, [entries])

  if (!party) return null

  const balance = party.balance

  function handleDelete() {
    if (!deleting) return
    deleteEntry.mutate(deleting.id, {
      onSuccess: () => {
        showToast('Entry removed')
        setDeleting(null)
      },
      onError: () => showToast('Could not remove entry', 'error'),
    })
  }

  async function handleShare() {
    if (!party || !entries) return
    setSharing(true)
    try {
      const { file, url, filename } = generateSupplierStatementBlob(party, entries)

      if (typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
        try {
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ title: `${party.name} — Supplier Statement`, files: [file] })
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
      showToast('Statement downloaded')
    } finally {
      setSharing(false)
    }
  }

  return (
    <>
      <Modal title={party.name} open={open} onClose={onClose} maxWidthClass="md:max-w-lg">
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-800">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Current Balance</p>
            <p className={`text-3xl font-bold ${balanceColor(balance)}`}>
              {balance === 0 ? 'Settled' : `₹${formatQty(Math.abs(balance))}`}
            </p>
            {balance !== 0 && (
              <p className={`text-sm font-semibold ${balanceColor(balance)}`}>
                {balance > 0 ? 'You owe (Payable)' : 'Advance with supplier'}
              </p>
            )}
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Purchased ₹{formatQty(party.total_purchased)} · Paid ₹{formatQty(party.total_paid)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEntryModal({ editing: null, initialType: 'payment' })}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700"
            >
              Record Payment
            </button>
            <button
              type="button"
              onClick={() => setEntryModal({ editing: null, initialType: 'refund' })}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              Refund / Opening Due
            </button>
          </div>

          <button
            type="button"
            onClick={handleShare}
            disabled={sharing || isLoading || (entries ?? []).length === 0}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Share2 className="h-3.5 w-3.5" />
            {sharing ? 'Preparing…' : 'Share Statement'}
          </button>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Receipt className="h-3.5 w-3.5" />
              Transaction History
            </div>

            {isLoading && <LoadingState />}
            {!isLoading && (entries ?? []).length === 0 && (
              <EmptyNote>
                No purchases or payments yet. Purchases recorded with this{' '}
                {party.party_type === 'supplier' ? 'supplier' : 'dealer'} appear here automatically.
              </EmptyNote>
            )}

            <div className="space-y-1.5">
              {(entries ?? []).map((entry) => (
                <TransactionRow
                  key={`${entry.kind}-${entry.id}`}
                  entry={entry}
                  onEdit={(e) => setEntryModal({ editing: e, initialType: 'payment' })}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <SupplierPaymentModal
        open={entryModal !== null}
        onClose={() => setEntryModal(null)}
        party={party}
        editing={entryModal?.editing ?? null}
        initialType={entryModal?.initialType ?? 'payment'}
        knownPayees={knownPayees}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Remove this entry?"
        message={
          deleting
            ? `Remove this ${deleting.kind} of ₹${formatQty(deleting.amount)}? The supplier's balance will be recalculated.`
            : ''
        }
        confirmLabel="Remove"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
