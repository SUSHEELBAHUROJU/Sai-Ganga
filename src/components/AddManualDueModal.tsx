import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { Field } from './Field'
import { useAddManualDue } from '../hooks/useLedger'
import { useToast } from '../lib/toast'
import { todayISODate } from '../lib/date'

type AddManualDueModalProps = {
  open: boolean
  onClose: () => void
  customerId: string
  customerName: string
}

/** For dues outside a bill — e.g. an old balance carried over from paper records. */
export function AddManualDueModal({ open, onClose, customerId, customerName }: AddManualDueModalProps) {
  const addManualDue = useAddManualDue()
  const { showToast } = useToast()

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISODate())
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setAmount('')
      setDate(todayISODate())
      setNote('')
    }
  }, [open])

  function handleSave() {
    const amountVal = Number(amount) || 0
    if (amountVal <= 0) {
      showToast('Enter an amount', 'error')
      return
    }

    addManualDue.mutate(
      { customer_id: customerId, amount: amountVal, date, note: note.trim() || null },
      {
        onSuccess: () => {
          showToast(`Due added for ${customerName}`)
          onClose()
        },
        onError: () => showToast('Could not add due', 'error'),
      },
    )
  }

  return (
    <Modal title="Add Manual Due / Charge" open={open} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          For <span className="font-semibold text-slate-900 dark:text-slate-100">{customerName}</span> —
          use this for a due that isn't from a bill (e.g. an old balance).
        </p>

        <Field
          label="Amount (₹)"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="text-lg font-bold"
        />

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
          placeholder="e.g. Opening balance from old records"
        />

        <button
          type="button"
          onClick={handleSave}
          disabled={addManualDue.isPending}
          className="w-full rounded-lg bg-red-600 py-3 text-base font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {addManualDue.isPending ? 'Saving…' : 'Add Due'}
        </button>
      </div>
    </Modal>
  )
}
