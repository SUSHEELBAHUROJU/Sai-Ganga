import { useState, useEffect } from 'react'
import { Modal } from './Modal'
import {
  Download,
  Printer,
  MessageCircle,
  AlertCircle,
  Ban,
  Pencil,
  IndianRupee,
  ExternalLink,
} from 'lucide-react'
import type { BillRow } from '../hooks/useBills'
import { useVoidBill } from '../hooks/useBills'
import { useBillPaymentStatuses, useCustomerLedgerBalances } from '../hooks/useLedger'
import { generateBillPdfBlob } from '../lib/pdfGenerator'
import { useToast } from '../lib/toast'
import { formatQty } from '../lib/format'
import { ConfirmDialog } from './ConfirmDialog'
import { RecordPaymentModal } from './RecordPaymentModal'

type BillPdfModalProps = {
  open: boolean
  bill: BillRow | null
  onClose: () => void
  onEditBill?: (bill: BillRow) => void
}

export function BillPdfModal({ open, bill, onClose, onEditBill }: BillPdfModalProps) {
  const { showToast } = useToast()
  const voidBill = useVoidBill()
  const [confirmVoidOpen, setConfirmVoidOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)

  const { data: billStatuses } = useBillPaymentStatuses()
  const { data: customerBalances } = useCustomerLedgerBalances()
  const paymentStatus = bill ? billStatuses?.get(bill.id) : undefined
  const customerLedger = bill?.customer_id
    ? customerBalances?.find((c) => c.customer_id === bill.customer_id)
    : undefined

  const [pdfData, setPdfData] = useState<{
    blob: Blob
    file: File
    filename: string
    url: string
  } | null>(null)

  const [canNativeShare, setCanNativeShare] = useState(false)

  useEffect(() => {
    if (open && bill) {
      const generated = generateBillPdfBlob(bill)
      setPdfData(generated)

      if (typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator) {
        try {
          const testFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })
          setCanNativeShare(navigator.canShare({ files: [testFile] }))
        } catch {
          setCanNativeShare(false)
        }
      } else {
        setCanNativeShare(false)
      }

      return () => {
        if (generated.url) URL.revokeObjectURL(generated.url)
      }
    } else {
      setPdfData(null)
    }
  }, [open, bill])

  if (!bill) return null

  function handleDownload() {
    if (!pdfData) return
    const a = document.createElement('a')
    a.href = pdfData.url
    a.download = pdfData.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    showToast(`Downloaded ${pdfData.filename}`)
  }

  async function handleShareWhatsApp() {
    if (!pdfData) return

    if (canNativeShare) {
      try {
        await navigator.share({
          title: `Bill ${bill!.bill_number}`,
          text: `Hello ${bill!.customer_name}, please find attached Invoice ${bill!.bill_number} for ₹${bill!.grand_total.toLocaleString('en-IN')}. Thank you for your business!`,
          files: [pdfData.file],
        })
        showToast('Shared successfully!')
        return
      } catch (err: any) {
        if (err.name === 'AbortError') return
      }
    }

    handleDownload()

    const rawPhone = (bill!.customer_phone || '').replace(/[^0-9]/g, '')
    const phoneWithCode = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone

    const message = encodeURIComponent(
      `Hello ${bill!.customer_name},\n\nPlease find attached Invoice *${bill!.bill_number}* for *₹${bill!.grand_total.toLocaleString('en-IN')}*.\n\nThank you for your business!`,
    )

    const whatsappUrl = phoneWithCode
      ? `https://wa.me/${phoneWithCode}?text=${message}`
      : `https://wa.me/?text=${message}`

    window.open(whatsappUrl, '_blank')
    showToast('PDF downloaded! Attach it in the WhatsApp chat window.')
  }

  function handlePrint() {
    if (!pdfData) return
    const printWindow = window.open(pdfData.url, '_blank')
    if (printWindow) {
      printWindow.focus()
      printWindow.print()
    }
  }

  function handleConfirmVoid() {
    if (!bill) return
    voidBill.mutate(bill.id, {
      onSuccess: () => {
        showToast(`Bill ${bill.bill_number} marked as VOIDED`)
        setConfirmVoidOpen(false)
        onClose()
      },
      onError: () => showToast('Failed to void bill', 'error'),
    })
  }

  const isVoided = bill.status === 'voided'

  return (
    <>
      <Modal title={`Tax Invoice — ${bill.bill_number}`} open={open} onClose={onClose} maxWidthClass="md:max-w-3xl">
        <div className="space-y-4">
          {isVoided && (
            <div className="flex items-center gap-2 rounded-lg bg-red-100 p-3 text-xs font-bold text-red-800 dark:bg-red-950/80 dark:text-red-200">
              <Ban className="h-4 w-4 shrink-0" />
              <span>THIS BILL HAS BEEN VOIDED / CANCELED. It remains preserved for accounting audit rules.</span>
            </div>
          )}

          {!isVoided && bill.customer_id && paymentStatus && (
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 ${
                paymentStatus.payment_status === 'paid'
                  ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
                  : paymentStatus.payment_status === 'partial'
                    ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                    : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
              }`}
            >
              <div>
                <p
                  className={`text-xs font-bold uppercase tracking-wider ${
                    paymentStatus.payment_status === 'paid'
                      ? 'text-green-700 dark:text-green-300'
                      : paymentStatus.payment_status === 'partial'
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-red-700 dark:text-red-300'
                  }`}
                >
                  {paymentStatus.payment_status === 'paid'
                    ? 'PAID'
                    : paymentStatus.payment_status === 'partial'
                      ? 'PARTIALLY PAID'
                      : 'DUE'}
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Bill Total: ₹{formatQty(bill.grand_total)}
                  {paymentStatus.payment_status !== 'paid' &&
                    ` — ₹${formatQty(paymentStatus.due_amount)} due`}
                </p>
              </div>
              {paymentStatus.payment_status !== 'paid' && (
                <button
                  type="button"
                  onClick={() => setPaymentOpen(true)}
                  className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-700 sm:w-auto"
                >
                  <IndianRupee className="h-3.5 w-3.5" />
                  Record Payment
                </button>
              )}
            </div>
          )}

          {/* Quick Action Toolbar — the grand total leads on a phone so the
              number is the first thing read, with the actions below it. */}
          <div className="flex flex-col-reverse gap-2 rounded-xl bg-slate-100 p-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between dark:bg-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 sm:w-auto"
              >
                <MessageCircle className="h-4 w-4" />
                Share via WhatsApp
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:flex-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:flex-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>

              {!isVoided && (
                <>
                  {onEditBill && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose()
                        onEditBill(bill)
                      }}
                      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:flex-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit Bill
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setConfirmVoidOpen(true)}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 sm:flex-none dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Void Bill
                  </button>
                </>
              )}
            </div>

            <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
              <span className="text-xs text-slate-500 dark:text-slate-400">Grand Total</span>
              <p className="font-mono text-base font-bold text-teal-600 sm:text-sm dark:text-teal-400">
                ₹{bill.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

        {!canNativeShare && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              On desktop: Tapping <strong>Share via WhatsApp</strong> downloads the PDF and opens WhatsApp Web so you can attach it to the chat.
            </span>
          </div>
        )}

        {/* PDF Embedded View / Preview */}
        {pdfData?.url ? (
          <div className="space-y-2">
            {/*
              iOS Safari (and some Android WebViews) will not render a PDF
              inside an iframe — it shows a blank box with no hint that
              anything is wrong. This link is always present so the bill is
              reachable on those browsers, not only where the embed works.
            */}
            <a
              href={pdfData.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <ExternalLink className="h-4 w-4" />
              Open bill PDF full screen
            </a>
            <div className="h-[45vh] min-h-[240px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:h-[500px] dark:border-slate-800 dark:bg-slate-900">
              <iframe
                src={pdfData.url}
                title={`Bill ${bill.bill_number}`}
                className="h-full w-full border-none"
              />
            </div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-slate-500">
            Generating PDF preview…
          </div>
        )}
      </div>
    </Modal>

    <ConfirmDialog
      open={confirmVoidOpen}
      title={`Void Bill ${bill.bill_number}?`}
      message={`Are you sure you want to void Bill ${bill.bill_number}? The bill number will remain preserved as VOIDED for GST compliance and audit rules.`}
      confirmLabel="Void Bill"
      danger
      onConfirm={handleConfirmVoid}
      onCancel={() => setConfirmVoidOpen(false)}
    />

    {bill.customer_id && (
      <RecordPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        customerId={bill.customer_id}
        customerName={bill.customer_name}
        outstandingBalance={Math.max(0, customerLedger?.balance ?? bill.grand_total)}
      />
    )}
    </>
  )
}
