import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { Field } from './Field'
import { Chip } from './Chip'
import { useRecordPayment, type PaymentApp, type PaymentMode } from '../hooks/useLedger'
import { useToast } from '../lib/toast'
import { todayISODate } from '../lib/date'
import { formatQty } from '../lib/format'

type RecordPaymentModalProps = {
  open: boolean
  onClose: () => void
  customerId: string
  customerName: string
  /** Current outstanding balance — "Mark Full Paid" auto-fills this. */
  outstandingBalance: number
}

const PAYMENT_APPS: { value: PaymentApp; label: string }[] = [
  { value: 'phonepe', label: 'PhonePe' },
  { value: 'gpay', label: 'GPay' },
  { value: 'other', label: 'Other' },
]

export function RecordPaymentModal({
  open,
  onClose,
  customerId,
  customerName,
  outstandingBalance,
}: RecordPaymentModalProps) {
  const recordPayment = useRecordPayment()
  const { showToast } = useToast()

  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<PaymentMode | null>(null)
  const [app, setApp] = useState<PaymentApp | null>(null)
  const [date, setDate] = useState(todayISODate())
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setAmount('')
      setMode(null)
      setApp(null)
      setDate(todayISODate())
      setNote('')
    }
  }, [open])

  const amountVal = Number(amount) || 0
  const dueAfter = Math.max(0, outstandingBalance - amountVal)
  const isOverpaying = amountVal > outstandingBalance && outstandingBalance > 0

  function markFullPaid() {
    setAmount(outstandingBalance > 0 ? String(outstandingBalance) : '')
  }

  function handleSave() {
    if (amountVal <= 0) {
      showToast('Enter an amount received', 'error')
      return
    }
    if (!mode) {
      showToast('Choose Cash or Online', 'error')
      return
    }

    recordPayment.mutate(
      {
        customer_id: customerId,
        amount: amountVal,
        date,
        payment_mode: mode,
        payment_app: mode === 'online' ? app : null,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          const remaining = Math.max(0, outstandingBalance - amountVal)
          showToast(
            remaining > 0
              ? `₹${formatQty(amountVal)} received from ${customerName} — ₹${formatQty(remaining)} still due`
              : `₹${formatQty(amountVal)} received from ${customerName} — fully paid!`,
          )
          onClose()
        },
        onError: () => showToast('Could not save payment', 'error'),
      },
    )
  }

  return (
    <Modal title="Record Payment Received" open={open} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          From <span className="font-semibold text-slate-900 dark:text-slate-100">{customerName}</span>
        </p>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Amount Received (₹)
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-lg font-bold text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {outstandingBalance > 0 && (
              <button
                type="button"
                onClick={markFullPaid}
                className="shrink-0 whitespace-nowrap rounded-lg bg-green-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
              >
                Mark Full Paid
              </button>
            )}
          </div>
          {outstandingBalance > 0 && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Outstanding: ₹{formatQty(outstandingBalance)}
              {amountVal > 0 &&
                (isOverpaying
                  ? ` — paying ₹${formatQty(amountVal)}, ₹${formatQty(amountVal - outstandingBalance)} extra will be kept as advance credit`
                  : ` — paying ₹${formatQty(amountVal)}, ₹${formatQty(dueAfter)} will remain due`)}
            </p>
          )}
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Payment Mode
          </span>
          <div className="flex flex-wrap gap-2">
            <Chip
              label="Cash"
              selected={mode === 'cash'}
              onClick={() => {
                setMode('cash')
                setApp(null)
              }}
            />
            <Chip label="Online" selected={mode === 'online'} onClick={() => setMode('online')} />
          </div>
        </div>

        {mode === 'online' && (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Via
            </span>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_APPS.map((a) => (
                <Chip
                  key={a.value}
                  label={a.label}
                  selected={app === a.value}
                  onClick={() => setApp(a.value)}
                />
              ))}
            </div>
          </div>
        )}

        <Field
          label="Date"
          type="date"
          value={date}
          max={todayISODate()}
          onChange={(e) => setDate(e.target.value)}
        />

        <Field
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Advance for next order"
        />

        <button
          type="button"
          onClick={handleSave}
          disabled={recordPayment.isPending}
          className="w-full rounded-lg bg-green-600 py-3 text-base font-bold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {recordPayment.isPending ? 'Saving…' : 'Save Payment'}
        </button>
      </div>
    </Modal>
  )
}
