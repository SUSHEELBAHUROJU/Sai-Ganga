import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from './Modal'
import { Field } from './Field'
import { DateField } from './DateField'
import { NumberStepper } from './NumberStepper'
import { ConfirmDialog } from './ConfirmDialog'
import { EmptyNote } from './States'
import {
  usePurchaseReturns,
  useReturnPurchase,
  useDeletePurchaseReturn,
  type PurchaseReturn,
} from '../hooks/usePurchaseReturns'
import { rawPurchaseSupplierName, type RawPurchaseRecordRow } from '../hooks/useRecords'
import { useToast } from '../lib/toast'
import { formatDateLabel, todayISODate } from '../lib/date'
import { formatQty } from '../lib/format'

type ReturnPurchaseModalProps = {
  purchase: RawPurchaseRecordRow | null
  onClose: () => void
}

/** The rate the return is valued at — the purchase's own rate. */
function purchaseRate(purchase: RawPurchaseRecordRow): number {
  if (purchase.price_per_kg != null) return Number(purchase.price_per_kg)
  return purchase.cost != null && purchase.total_qty_kg > 0 ? Number(purchase.cost) / purchase.total_qty_kg : 0
}

/** The database rejects over-returns with a readable message; show it as-is. */
function returnErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null
  return e?.code === 'P0001' && e.message ? e.message : 'Could not save return'
}

export function ReturnPurchaseModal({ purchase, onClose }: ReturnPurchaseModalProps) {
  const { data: returns } = usePurchaseReturns(purchase?.id ?? null)
  const addReturn = useReturnPurchase()
  const deleteReturn = useDeletePurchaseReturn()
  const { showToast } = useToast()

  const [returnDate, setReturnDate] = useState(todayISODate())
  const [kg, setKg] = useState('')
  const [reason, setReason] = useState('')
  const [deleting, setDeleting] = useState<PurchaseReturn | null>(null)

  useEffect(() => {
    setReturnDate(todayISODate())
    setKg('')
    setReason('')
  }, [purchase?.id])

  if (!purchase) return null

  const rate = purchaseRate(purchase)
  const supplier = rawPurchaseSupplierName(purchase)
  const returnedKg = (returns ?? []).reduce((sum, r) => sum + Number(r.quantity_kg), 0)
  const remainingKg = purchase.total_qty_kg - returnedKg
  const kgValue = Number(kg) || 0

  function handleSave() {
    if (!purchase) return
    if (kgValue <= 0) {
      showToast('Enter the kg being returned', 'error')
      return
    }
    if (kgValue > remainingKg) {
      showToast(`Only ${formatQty(remainingKg)} kg of this purchase is left to return`, 'error')
      return
    }
    if (!reason.trim()) {
      showToast('Enter why it is being returned', 'error')
      return
    }
    addReturn.mutate(
      { purchase_id: purchase.id, return_date: returnDate, quantity_kg: kgValue, reason: reason.trim() },
      {
        onSuccess: () => {
          const value = formatQty(Math.round(kgValue * rate * 100) / 100)
          // Only a purchase linked to a supplier is on anyone's ledger.
          showToast(
            purchase.supplier_id && purchase.cost != null
              ? `Return saved — ₹${value} off ${supplier ?? 'the supplier'}'s dues`
              : 'Return saved',
          )
          setKg('')
          setReason('')
        },
        onError: (error) => showToast(returnErrorMessage(error), 'error'),
      },
    )
  }

  function handleDelete() {
    if (!deleting) return
    deleteReturn.mutate(deleting.id, {
      onSuccess: () => {
        showToast('Return removed')
        setDeleting(null)
      },
      onError: () => showToast('Could not remove return', 'error'),
    })
  }


  return (
    <>
      <Modal title="Return to Supplier" open onClose={onClose}>
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {purchase.raw_material_types?.name ?? 'Material'} · {formatQty(purchase.total_qty_kg)} kg
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bought {formatDateLabel(purchase.entry_date)}
              {supplier ? ` from ${supplier}` : ''} @ ₹{formatQty(rate)}/kg
            </p>
            {returnedKg > 0 && (
              <p className="mt-1 text-xs font-semibold text-orange-700 dark:text-orange-400">
                Already returned {formatQty(returnedKg)} kg · {formatQty(remainingKg)} kg can still be returned
              </p>
            )}
          </div>

          {remainingKg > 0 ? (
            <>
              <DateField value={returnDate} onChange={setReturnDate} />
              <NumberStepper label="Kg returned" value={kg} onChange={setKg} allowDecimal step={5} />
              <Field
                label="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Wet material, wrong grade"
              />
              {kgValue > 0 && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Value: <span className="font-bold">₹{formatQty(Math.round(kgValue * rate * 100) / 100)}</span> — taken
                  out of stock{purchase.supplier_id && purchase.cost != null ? " and off the supplier's dues" : ''}.
                </p>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={addReturn.isPending}
                className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-40"
              >
                {addReturn.isPending ? 'Saving…' : 'Save Return'}
              </button>
            </>
          ) : (
            <EmptyNote>This whole purchase has been returned.</EmptyNote>
          )}

          {(returns ?? []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Returns
              </p>
              {(returns ?? []).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/70 px-3 py-2 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatQty(r.quantity_kg)} kg · ₹{formatQty(Math.round(r.quantity_kg * rate * 100) / 100)}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {formatDateLabel(r.return_date)} · {r.reason}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete return"
                    onClick={() => setDeleting(r)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Remove this return?"
        message={
          deleting
            ? `Remove the return of ${formatQty(deleting.quantity_kg)} kg? It goes back into stock and onto the supplier's dues.`
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
