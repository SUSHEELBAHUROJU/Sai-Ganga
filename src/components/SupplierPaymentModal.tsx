import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { Field } from './Field'
import { Chip } from './Chip'
import {
  useAddSupplierLedgerEntry,
  useUpdateSupplierLedgerEntry,
  balanceEffect,
  supplierBalanceText,
  SUPPLIER_PAYMENT_MODE_LABEL,
  SUPPLIER_PAYMENT_APP_LABEL,
  type SupplierEntryType,
  type SupplierLedgerBalance,
  type SupplierLedgerEntryFields,
  type SupplierPassbookEntry,
  type SupplierPaymentApp,
  type SupplierPaymentMode,
} from '../hooks/useSupplierLedger'
import { useToast } from '../lib/toast'
import { isFutureISODate, todayISODate } from '../lib/date'
import { formatQty } from '../lib/format'

type SupplierPaymentModalProps = {
  open: boolean
  onClose: () => void
  party: SupplierLedgerBalance
  /** Set to edit an existing payment / due / refund; null to add a new one. */
  editing: SupplierPassbookEntry | null
  /** Entry type a new entry starts on. */
  initialType: SupplierEntryType
  /** Names money has gone to before for this party — offered as one-tap picks. */
  knownPayees: string[]
  /** Our-side names that have paid this party before. */
  knownPayers: string[]
}

const ENTRY_TYPES: { value: SupplierEntryType; label: string }[] = [
  { value: 'payment', label: 'Payment Made' },
  { value: 'refund', label: 'Refund Received' },
  { value: 'due', label: 'Opening / Manual Due' },
]

const PAYMENT_MODES = Object.entries(SUPPLIER_PAYMENT_MODE_LABEL) as [SupplierPaymentMode, string][]
const PAYMENT_APPS = Object.entries(SUPPLIER_PAYMENT_APP_LABEL) as [SupplierPaymentApp, string][]

const TYPE_HINT: Record<SupplierEntryType, string> = {
  payment: 'Money you paid — advance, part payment or settlement.',
  refund: 'Money the supplier returned to you, e.g. leftover advance after a short delivery.',
  due: 'An amount you owe that isn’t from a recorded purchase, e.g. an old balance from paper records.',
}

export function SupplierPaymentModal({
  open,
  onClose,
  party,
  editing,
  initialType,
  knownPayees,
  knownPayers,
}: SupplierPaymentModalProps) {
  const addEntry = useAddSupplierLedgerEntry()
  const updateEntry = useUpdateSupplierLedgerEntry()
  const { showToast } = useToast()

  const [type, setType] = useState<SupplierEntryType>(initialType)
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<SupplierPaymentMode | null>(null)
  const [app, setApp] = useState<SupplierPaymentApp | null>(null)
  const [paidTo, setPaidTo] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [date, setDate] = useState(todayISODate())
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing && editing.kind !== 'purchase' && editing.kind !== 'return') {
      setType(editing.kind)
      setAmount(String(editing.amount))
      setMode(editing.payment_mode)
      setApp(editing.payment_app)
      setPaidTo(editing.paid_to ?? '')
      setReferenceNo(editing.reference_no ?? '')
      setBankAccount(editing.bank_account ?? '')
      setPaidBy(editing.paid_by ?? '')
      setDate(editing.entry_date)
      setNote(editing.note ?? '')
    } else {
      setType(initialType)
      setAmount('')
      setMode(null)
      setApp(null)
      setPaidTo(party.name)
      setReferenceNo('')
      setBankAccount('')
      setPaidBy('')
      setDate(todayISODate())
      setNote('')
    }
  }, [open, editing, initialType, party.name])

  const isPayment = type === 'payment'
  const showTransferFields = isPayment && (mode === 'online' || mode === 'cash_deposit')
  const amountVal = Number(amount) || 0

  // Balance as it stands without this entry, so the preview is right when
  // editing too (the original amount is already baked into party.balance).
  const baseBalance =
    party.balance - (editing && editing.kind !== 'purchase' ? balanceEffect(editing.kind, editing.amount) : 0)
  const balanceAfter = baseBalance + balanceEffect(type, amountVal)
  const pending = addEntry.isPending || updateEntry.isPending

  function handleSave() {
    if (isFutureISODate(date)) {
      showToast('Date cannot be in the future', 'error')
      return
    }
    if (amountVal <= 0) {
      showToast('Enter an amount', 'error')
      return
    }
    if (isPayment && !mode) {
      showToast('Choose Cash, Online or Cash Deposit', 'error')
      return
    }
    if (isPayment && mode === 'online' && !app) {
      showToast('Choose PhonePe, GPay, Paytm or Other', 'error')
      return
    }
    if (isPayment && !paidTo.trim()) {
      showToast('Enter who the money was given to (Paid To)', 'error')
      return
    }
    if (isPayment && !paidBy.trim()) {
      showToast('Enter who paid from our side (Paid By)', 'error')
      return
    }

    const fields: SupplierLedgerEntryFields = {
      type,
      amount: amountVal,
      date,
      payment_mode: isPayment ? mode : null,
      payment_app: isPayment && mode === 'online' ? app : null,
      paid_to: isPayment ? paidTo.trim() : null,
      reference_no: showTransferFields ? referenceNo.trim() || null : null,
      bank_account: showTransferFields ? bankAccount.trim() || null : null,
      paid_by: isPayment ? paidBy.trim() : null,
      note: note.trim() || null,
    }

    const callbacks = {
      onSuccess: () => {
        showToast(
          editing
            ? `Entry updated — ${party.name}: ${supplierBalanceText(balanceAfter, formatQty)}`
            : `Saved — ${party.name}: ${supplierBalanceText(balanceAfter, formatQty)}`,
        )
        onClose()
      },
      onError: () => showToast('Could not save entry', 'error'),
    }

    if (editing) {
      updateEntry.mutate({ ...fields, id: editing.id }, callbacks)
    } else {
      addEntry.mutate({ ...fields, party_type: party.party_type, party_id: party.party_id }, callbacks)
    }
  }

  const payeeChoices = knownPayees.filter((name) => name !== paidTo.trim()).slice(0, 6)
  const payerChoices = knownPayers.filter((name) => name !== paidBy.trim()).slice(0, 6)

  return (
    <Modal title={editing ? 'Edit Entry' : 'Supplier Payment'} open={open} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-900 dark:text-slate-100">{party.name}</span> ·{' '}
          {supplierBalanceText(baseBalance, formatQty)}
        </p>

        <div>
          <div className="flex flex-wrap gap-2">
            {ENTRY_TYPES.map((t) => (
              <Chip key={t.value} label={t.label} selected={type === t.value} onClick={() => setType(t.value)} />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{TYPE_HINT[type]}</p>
        </div>

        <div>
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
          {amountVal > 0 && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              After this: <span className="font-semibold">{supplierBalanceText(balanceAfter, formatQty)}</span>
            </p>
          )}
        </div>

        {isPayment && (
          <>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Payment Mode
              </span>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_MODES.map(([value, label]) => (
                  <Chip key={value} label={label} selected={mode === value} onClick={() => setMode(value)} />
                ))}
              </div>
            </div>

            {mode === 'online' && (
              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Via</span>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_APPS.map(([value, label]) => (
                    <Chip key={value} label={label} selected={app === value} onClick={() => setApp(value)} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <Field
                label="Paid To (person)"
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
                placeholder="Who received the money"
              />
              {payeeChoices.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {payeeChoices.map((name) => (
                    <Chip key={name} label={name} onClick={() => setPaidTo(name)} />
                  ))}
                </div>
              )}
            </div>

            <div>
              <Field
                label="Paid By"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                placeholder="Who paid from our side"
              />
              {payerChoices.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {payerChoices.map((name) => (
                    <Chip key={name} label={name} onClick={() => setPaidBy(name)} />
                  ))}
                </div>
              )}
            </div>

            {showTransferFields && (
              <>
                <Field
                  label="Reference / UTR No. (optional)"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder={mode === 'cash_deposit' ? 'Deposit slip no.' : 'UTR / transaction ID'}
                />
                <Field
                  label="Bank / Account (optional)"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="e.g. SBI – Ramesh"
                />
              </>
            )}
          </>
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
          placeholder={isPayment ? 'e.g. Advance for next load' : 'Note'}
        />

        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="w-full rounded-lg bg-green-600 py-3 text-base font-bold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : editing ? 'Save Changes' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
