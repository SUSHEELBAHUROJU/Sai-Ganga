import { useState, useEffect, useMemo } from 'react'
import { Modal } from './Modal'
import { Download, Printer, MessageCircle, AlertCircle, Ban, Pencil } from 'lucide-react'
import type { BillRow } from '../hooks/useBills'
import { useVoidBill } from '../hooks/useBills'
import { useCompanySettings } from '../hooks/useCompanySettings'
import { generateBillPdfBlob } from '../lib/pdfGenerator'
import { useToast } from '../lib/toast'
import { ConfirmDialog } from './ConfirmDialog'

type BillPdfModalProps = {
  open: boolean
  bill: BillRow | null
  onClose: () => void
  onEditBill?: (bill: BillRow) => void
}

export function BillPdfModal({ open, bill, onClose, onEditBill }: BillPdfModalProps) {
  const { data: company } = useCompanySettings()
  const { showToast } = useToast()
  const voidBill = useVoidBill()
  const [confirmVoidOpen, setConfirmVoidOpen] = useState(false)

  const [pdfData, setPdfData] = useState<{
    blob: Blob
    file: File
    filename: string
    url: string
  } | null>(null)

  const [canNativeShare, setCanNativeShare] = useState(false)

  const companyData = useMemo(
    () =>
      company || {
        id: 'default',
        business_name: 'SAI GANGA POLYMER INDUSTRIES',
        address:
          'SY.NO.216, H.NO. 3-245, NH 65, opp. M.S.R. Institute, Durajpalle, Suryapet, Telangana 508213',
        gst_number: '36ALRPB5625Q2ZG',
        phone: '',
        bill_prefix: 'SG-',
        next_bill_number: 1,
        bill_start_date: '',
        updated_at: '',
      },
    [company],
  )

  useEffect(() => {
    if (open && bill) {
      const generated = generateBillPdfBlob(bill, companyData)
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
  }, [open, bill, companyData])

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
          text: `Invoice ${bill!.bill_number} from ${companyData.business_name} for ₹${bill!.grand_total.toLocaleString('en-IN')}`,
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
      `Hello ${bill!.customer_name},\n\nPlease find attached Invoice *${bill!.bill_number}* from *${companyData.business_name}* for *₹${bill!.grand_total.toLocaleString('en-IN')}*.\n\nThank you for your business!`,
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

          {/* Quick Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
              >
                <MessageCircle className="h-4 w-4" />
                Share via WhatsApp
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
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
                      className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit Bill
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setConfirmVoidOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Void Bill
                  </button>
                </>
              )}
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-500 dark:text-slate-400">Grand Total</span>
              <p className="font-mono text-sm font-bold text-teal-600 dark:text-teal-400">
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
          <div className="h-[500px] w-full rounded-xl border border-slate-200 overflow-hidden bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
            <iframe
              src={pdfData.url}
              title={`Bill ${bill.bill_number}`}
              className="h-full w-full border-none"
            />
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
    </>
  )
}
