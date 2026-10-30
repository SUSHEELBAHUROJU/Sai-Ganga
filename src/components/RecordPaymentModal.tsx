import { useEffect, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { Modal } from './Modal'
import { Field } from './Field'
import { Chip } from './Chip'
import { useRecordPayment, type PaymentApp, type PaymentMode } from '../hooks/useLedger'
import { useSupplierLedgerBalances, supplierBalanceText, type SupplierLedgerBalance } from '../hooks/useSupplierLedger'
import { useToast } from '../lib/toast'
import { isFutureISODate, todayISODate } from '../lib/date'
import { formatQty } from '../lib/format'

type RecordPaymentModalProps = {
  open: boolean
  onClose: () => void
  customerId: string
  customerName: string
  /** Current outstanding balance — "Mark Full Paid" auto-fills this. */
  outstandingBalance: number
}

/** Who the customer handed the money to: us, or one of our suppliers. */
type Payee = 'us' | 'supplier'

const partyKey = (p: Pick<SupplierLedgerBalance, 'party_type' | 'party_id'>) => `${p.party_type}:${p.party_id}`

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
  const [payee, setPayee] = useState<Payee>('us')
  const [partyKeySelected, setPartyKeySelected] = useState<string | null>(null)
  const [supplierSearch, setSupplierSearch] = useState('')

  const { data: supplierBalances } = useSupplierLedgerBalances()

  useEffect(() => {
    if (open) {
      setAmount('')
      setMode(null)
      setApp(null)
      setDate(todayISODate())
      setNote('')
      setPayee('us')
      setPartyKeySelected(null)
      setSupplierSearch('')
    }
  }, [open])

  // Active suppliers and scrap dealers, the ones we owe most first — the
  // usual reason to send a customer to a supplier is to clear what we owe.
  const supplierOptions = useMemo(() => {
    const query = supplierSearch.trim().toLowerCase()
    return (supplierBalances ?? [])
      .filter((p) => p.is_active && (!query || p.name.toLowerCase().includes(query)))
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
  }, [supplierBalances, supplierSearch])

  const selectedParty =
    payee === 'supplier' ? (supplierBalances ?? []).find((p) => partyKey(p) === partyKeySelected) ?? null : null

  const amountVal = Number(amount) || 0
  const dueAfter = Math.max(0, outstandingBalance - amountVal)
  const isOverpaying = amountVal > outstandingBalance && outstandingBalance > 0

  function markFullPaid() {
    setAmount(outstandingBalance > 0 ? String(outstandingBalance) : '')
  }

  function handleSave() {
    if (isFutureISODate(date)) {
      showToast('Payment date cannot be in the future', 'error')
      return
    }

    if (amountVal <= 0) {
      showToast('Enter an amount received', 'error')
      return
    }
    if (!mode) {
      showToast('Choose Cash or Online', 'error')
      return
    }
    if (payee === 'supplier' && !selectedParty) {
      showToast('Choose the supplier the customer paid', 'error')
      return
    }

    // The ledger screens update the moment this is called (optimistic update
    // in useRecordPayment), so close right away rather than waiting on the
    // network. useRecordPayment reports the outcome, and rolls the figures
    // back if the save fails.
    onClose()
    recordPayment.mutate({
      customer_id: customerId,
      amount: amountVal,
      date,
      payment_mode: mode,
      payment_app: mode === 'online' ? app : null,
      note: note.trim() || null,
      paid_to: selectedParty
        ? { party_type: selectedParty.party_type, party_id: selectedParty.party_id }
        : null,
    })
  }

  return (
    <Modal title="Record Payment Received" open={open} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          From <span className="font-semibold text-slate-900 dark:text-slate-100">{customerName}</span>
        </p>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Who got the money?
          </span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who got the money">
            {(
              [
                { value: 'us', title: 'Us', hint: 'Paid to Sai Ganga' },
                { value: 'supplier', title: 'A supplier', hint: 'Paid directly for us' },
              ] as const
            ).map((opt) => {
              const selected = payee === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPayee(opt.value)}
                  className={`min-h-[56px] rounded-lg border-2 px-3 py-2 text-left transition-colors ${
                    selected
                      ? 'border-teal-600 bg-teal-50 dark:border-teal-500 dark:bg-teal-950/40'
                      : 'border-slate-300 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{opt.title}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{opt.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        {payee === 'supplier' && (
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Paid to which supplier?
            </span>
            {(supplierBalances?.length ?? 0) > 6 && (
              <label className="relative mb-2 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Search suppliers"
                  className="min-h-[44px] w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-base text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
            )}
            <div className="max-h-56 space-y-1.5 overflow-y-auto" role="radiogroup" aria-label="Supplier">
              {supplierOptions.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {supplierSearch ? 'No supplier matches that name.' : 'No suppliers yet — add one in Settings.'}
                </p>
              )}
              {supplierOptions.map((p) => {
                const selected = partyKey(p) === partyKeySelected
                return (
                  <button
                    key={partyKey(p)}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPartyKeySelected(partyKey(p))}
                    className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                      selected
                        ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600 dark:border-teal-500 dark:bg-teal-950/40 dark:ring-teal-500'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {p.name}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {p.party_type === 'scrap_dealer' ? 'Scrap dealer' : 'Raw material supplier'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className={`text-xs font-semibold ${p.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}
                      >
                        {supplierBalanceText(p.balance, formatQty)}
                      </span>
                      {selected && <Check className="h-4 w-4 text-teal-600 dark:text-teal-400" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {payee === 'supplier' ? 'Amount Paid to Supplier (₹)' : 'Amount Received (₹)'}
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

        {selectedParty && amountVal > 0 && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-xs text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
            <p className="mb-1 font-semibold">This one payment updates both ledgers:</p>
            <p>
              • {customerName} owes us ₹{formatQty(amountVal)} less
              {outstandingBalance > 0 ? ` (₹${formatQty(outstandingBalance)} → ₹${formatQty(outstandingBalance - amountVal)})` : ''}
            </p>
            <p>
              • We owe {selectedParty.name} ₹{formatQty(amountVal)} less (
              {supplierBalanceText(selectedParty.balance, formatQty)} →{' '}
              {supplierBalanceText(selectedParty.balance - amountVal, formatQty)})
            </p>
          </div>
        )}

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
          {recordPayment.isPending
            ? 'Saving…'
            : selectedParty
              ? `Save — paid to ${selectedParty.name}`
              : 'Save Payment'}
        </button>
      </div>
    </Modal>
  )
}
