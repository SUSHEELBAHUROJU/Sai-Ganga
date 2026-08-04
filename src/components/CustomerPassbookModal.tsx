import { useState } from 'react'
import { Modal } from './Modal'
import { ConfirmDialog } from './ConfirmDialog'
import { RecordPaymentModal } from './RecordPaymentModal'
import { AddManualDueModal } from './AddManualDueModal'
import { Trash2, Receipt, Share2 } from 'lucide-react'
import {
  useCustomerPassbook,
  useDeleteLedgerTransaction,
  type CustomerLedgerBalance,
  type PassbookEntry,
} from '../hooks/useLedger'
import { LoadingState, EmptyNote } from './States'
import { useToast } from '../lib/toast'
import { formatDateLabel } from '../lib/date'
import { formatQty } from '../lib/format'
import { generateLedgerStatementBlob } from '../lib/pdfGenerator'

type CustomerPassbookModalProps = {
  open: boolean
  customer: CustomerLedgerBalance | null
  onClose: () => void
}

const PAYMENT_APP_LABEL: Record<string, string> = { phonepe: 'PhonePe', gpay: 'GPay', other: 'Other' }

function TransactionRow({
  entry,
  onDelete,
}: {
  entry: PassbookEntry
  onDelete: (entry: PassbookEntry) => void
}) {
  const isDue = entry.type === 'due'
  const modeLabel =
    entry.payment_mode === 'online'
      ? `Online${entry.payment_app ? ` · ${PAYMENT_APP_LABEL[entry.payment_app]}` : ''}`
      : entry.payment_mode === 'cash'
        ? 'Cash'
        : null

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200/70 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {entry.bill_number ? `Bill ${entry.bill_number}` : isDue ? 'Due' : 'Payment Received'}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formatDateLabel(entry.entry_date)}
          {modeLabel ? ` · ${modeLabel}` : ''}
        </p>
        {entry.note && (
          <p className="mt-0.5 truncate text-xs italic text-slate-400 dark:text-slate-500">{entry.note}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-right">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {isDue ? 'Order Amount' : 'Payment Received'}
          </p>
          <p
            className={`font-mono text-sm font-bold ${isDue ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
          >
            ₹{formatQty(entry.amount)}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Bal: ₹{formatQty(entry.running_balance)}
          </p>
        </div>
        {!entry.bill_number && (
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

export function CustomerPassbookModal({ open, customer, onClose }: CustomerPassbookModalProps) {
  const { data: entries, isLoading } = useCustomerPassbook(customer?.customer_id ?? null)
  const deleteTxn = useDeleteLedgerTransaction()
  const { showToast } = useToast()

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [manualDueOpen, setManualDueOpen] = useState(false)
  const [deleting, setDeleting] = useState<PassbookEntry | null>(null)
  const [sharing, setSharing] = useState(false)

  if (!customer) return null

  const balance = customer.balance
  const balanceLabel = balance > 0 ? 'Due' : balance < 0 ? 'Advance / Credit' : 'Settled'
  const balanceColor =
    balance > 0
      ? 'text-red-600 dark:text-red-400'
      : balance < 0
        ? 'text-teal-600 dark:text-teal-400'
        : 'text-green-600 dark:text-green-400'

  function handleDelete() {
    if (!deleting || !customer) return
    deleteTxn.mutate(
      { id: deleting.id, customer_id: customer.customer_id },
      {
        onSuccess: () => {
          showToast('Entry removed')
          setDeleting(null)
        },
        onError: () => showToast('Could not remove entry', 'error'),
      },
    )
  }

  async function handleShare() {
    if (!customer || !entries) return
    setSharing(true)
    try {
      const { file, url, filename } = generateLedgerStatementBlob(customer, entries)

      if (typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
        try {
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ title: `${customer.name} — Account Statement`, files: [file] })
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
      showToast('Statement downloaded — attach it in WhatsApp')
    } finally {
      setSharing(false)
    }
  }

  return (
    <>
      <Modal title={customer.name} open={open} onClose={onClose} maxWidthClass="md:max-w-lg">
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-800">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Current Balance</p>
            <p className={`text-3xl font-bold ${balanceColor}`}>
              {balance === 0 ? 'Settled' : `₹${formatQty(Math.abs(balance))}`}
            </p>
            {balance !== 0 && <p className={`text-sm font-semibold ${balanceColor}`}>{balanceLabel}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700"
            >
              Record Payment Received
            </button>
            <button
              type="button"
              onClick={() => setManualDueOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-red-50 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
            >
              Add Manual Due
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
              <EmptyNote>No transactions yet for this customer.</EmptyNote>
            )}

            <div className="space-y-1.5">
              {(entries ?? []).map((entry) => (
                <TransactionRow key={entry.id} entry={entry} onDelete={setDeleting} />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <RecordPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        customerId={customer.customer_id}
        customerName={customer.name}
        outstandingBalance={Math.max(0, balance)}
      />

      <AddManualDueModal
        open={manualDueOpen}
        onClose={() => setManualDueOpen(false)}
        customerId={customer.customer_id}
        customerName={customer.name}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Remove this entry?"
        message={
          deleting
            ? `Remove this ${deleting.type === 'due' ? 'due' : 'payment'} of ₹${formatQty(deleting.amount)}? This will recalculate the customer's balance.`
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
