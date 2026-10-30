import jsPDF from 'jspdf'
import type { BillLineItem, BillRow } from '../hooks/useBills'
import type { CustomerLedgerBalance, PassbookEntry, CustomerLedgerPeriodData } from '../hooks/useLedger'
import {
  supplierPaymentModeText,
  type SupplierLedgerBalance,
  type SupplierPassbookEntry,
  type SupplierLedgerPeriodData,
} from '../hooks/useSupplierLedger'
import type { RecordKind } from '../hooks/useRecords'
import type { ProductionCostReport } from '../hooks/useProductionCost'
import {
  costPerKgProduced,
  myCostSummary,
  materialCostPerKg,
  runningCostPerKg,
  yieldPercent,
  type MyCosts,
  type StockCheckPeriod,
} from '../hooks/useStockChecks'
import { formatInvoiceDate, formatStatementDate, todayISODate } from './date'
import { formatPipeProductLabel } from './format'
import { LOGO_ASPECT, LOGO_DATA_URL } from './pdfLogo'
import { pdfCompany as company, companyContactLine } from './pdfCompany'

/* ==========================================================================
 * Bill PDF — compact two-copy A4 layout
 *
 * One A4 sheet carries two identical invoices, top and bottom half, so the
 * page can be cut once across the middle and both halves are a complete,
 * self-contained bill (one for the customer, one for the office).
 *
 * This is a purpose-built print template, not the old full-page invoice
 * scaled down: everything that only made sense on a full sheet is gone
 * (amount-in-words block, boxed address cards, tall signature area, footer
 * blurbs) so what's left is the information actually needed on a physical
 * bill at a readable size.
 * ========================================================================== */

type Rgb = readonly [number, number, number]

const NAVY: Rgb = [15, 31, 69]
const RED: Rgb = [210, 31, 31]
const DARK_TEXT: Rgb = [30, 41, 59]
const MUTED_TEXT: Rgb = [100, 116, 139]
const BAND_BG: Rgb = [235, 242, 250]
const ROW_ALT_BG: Rgb = [243, 246, 250]
const BORDER_GRAY: Rgb = [214, 222, 233]

const GREEN: Rgb = [21, 128, 61]

function drawLogo(doc: jsPDF, x: number, y: number, width: number): number {
  const height = width * LOGO_ASPECT
  doc.addImage(LOGO_DATA_URL, 'JPEG', x, y, width, height, 'sai-ganga-logo', 'FAST')
  return height
}

const PAGE_W = 210
const PAGE_H = 297
const MARGIN_X = 10
const MARGIN_Y = 8
/** Blank strip around the cut line so scissors don't clip either copy. */
const CUT_GUTTER = 7
const COPY_H = (PAGE_H - MARGIN_Y * 2 - CUT_GUTTER) / 2

/** Vertical cost of everything in a copy that isn't an item row. */
const HEAD_H = 15
/**
 * Meta block depth. Grows only when the address actually wraps to a second
 * line — a fixed two-line allowance would push every bill's table down and
 * cost a row of items on sheets where the address fits on one line.
 */
const META_H_BASE = 13.5
const META_H_PER_EXTRA_LINE = 4
const THEAD_H = 5.8
const QTY_BAND_H = 5.6
const SUM_ROW_H = 4.6
const GRAND_H = 8.6
const FOOT_H = 5.5

/** Width available to the customer name / address column. */
const META_TEXT_W = 100
/** Address is capped at two lines; the full address lives in the app. */
const ADDR_MAX_LINES = 2

/** Rows breathe at MAX; they tighten toward MIN as the item count grows. */
const ROW_H_MAX = 5.6
const ROW_H_MIN = 4

const COL = {
  sl: MARGIN_X + 3,
  desc: MARGIN_X + 8,
  qty: MARGIN_X + 98,
  kg: MARGIN_X + 123,
  rate: MARGIN_X + 148,
  amount: PAGE_W - MARGIN_X - 2,
} as const

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const num = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

/**
 * line_items is a jsonb column, so depending on how the row was fetched it can
 * arrive already parsed or still a string — EditBillModal guards the same way.
 * A malformed value must not take the whole PDF down.
 */
function normalizeLineItems(raw: unknown): BillLineItem[] {
  let items: unknown = raw
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items)
    } catch {
      return []
    }
  }
  return Array.isArray(items) ? (items as BillLineItem[]) : []
}

type SummaryLine = { label: string; value: string }

function summaryLinesFor(bill: BillRow): SummaryLine[] {
  const lines: SummaryLine[] = [
    { label: 'Subtotal', value: `Rs. ${money(bill.subtotal ?? bill.grand_total)}` },
  ]
  if ((bill.discount ?? 0) > 0) {
    lines.push({ label: 'Discount', value: `- Rs. ${money(bill.discount)}` })
  }
  if ((bill.tax ?? 0) > 0) {
    lines.push({ label: 'Tax / GST', value: `+ Rs. ${money(bill.tax)}` })
  }
  if ((bill.transport_charges ?? 0) > 0) {
    lines.push({ label: 'Transport', value: `+ Rs. ${money(bill.transport_charges)}` })
  }
  return lines
}

type CopyOptions = {
  /** Items to print in this copy (a slice, when a bill needs more than one sheet). */
  items: BillLineItem[]
  /** Whole-bill quantity totals — shown only on the sheet carrying the totals. */
  totalPcs: number
  totalKg: number
  summary: SummaryLine[]
  rowH: number
  /** False on a continuation sheet, where the money totals come later. */
  showTotals: boolean
  /** e.g. "Sheet 1 of 2", or null for a single-sheet bill. */
  sheetLabel: string | null
  /** Index of this copy's first item within the whole bill, for row numbering. */
  startIndex: number
  /** Pre-wrapped address lines and the meta depth they imply — measured once
   *  so every copy and the row-capacity maths agree on where the table starts. */
  addrLines: string[]
  metaH: number
}

/**
 * Largest of `sizes` at which `text` fits `maxW` on one line. Used for the
 * customer name: a long trading name would otherwise be cut mid-word, and
 * losing "… Pvt Ltd" off a bill is not acceptable. Assumes the caller has
 * already selected the font family/style.
 */
function fitFontSize(doc: jsPDF, text: string, maxW: number, sizes: number[]): number {
  for (const size of sizes) {
    doc.setFontSize(size)
    if (doc.getTextWidth(text) <= maxW) return size
  }
  return sizes[sizes.length - 1]
}

/** Address as it will be drawn: wrapped to the meta column, capped at 2 lines. */
function wrapAddress(doc: jsPDF, address: string | null): string[] {
  if (!address?.trim()) return []
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  return (doc.splitTextToSize(address, META_TEXT_W) as string[]).slice(0, ADDR_MAX_LINES)
}

/** Draws one complete invoice into a half-page starting at `top`. */
function drawInvoiceCopy(doc: jsPDF, bill: BillRow, top: number, opts: CopyOptions): void {
  const contentWidth = PAGE_W - MARGIN_X * 2
  const isVoided = bill.status === 'voided'
  let y = top

  // ---------------------------------------------------------------- header
  // Logo on the left, the shop's address / phone / GSTIN beside it, and the
  // INVOICE badge on the right.
  const logoH = drawLogo(doc, MARGIN_X, y, 46)

  // A voided bill must be unmistakable on paper, so it takes over the badge.
  const badgeLabel = isVoided ? 'VOIDED' : 'INVOICE'
  const badgeW = isVoided ? 24 : 22
  const badgeH = 6.4
  const badgeX = PAGE_W - MARGIN_X - badgeW
  doc.setFillColor(...(isVoided ? RED : NAVY))
  doc.rect(badgeX, y + 0.4, badgeW, badgeH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(255, 255, 255)
  doc.text(badgeLabel, badgeX + badgeW / 2, y + 4.8, { align: 'center' })

  if (opts.sheetLabel) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(opts.sheetLabel, PAGE_W - MARGIN_X, y + 10.6, { align: 'right' })
  }

  const infoX = MARGIN_X + 50
  const infoW = badgeX - infoX - 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...DARK_TEXT)
  let infoY = y + 3.6
  if (company.address) {
    ;(doc.splitTextToSize(company.address, infoW) as string[]).slice(0, 2).forEach((line) => {
      doc.text(line, infoX, infoY)
      infoY += 3.2
    })
  }
  const contact = companyContactLine()
  if (contact) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text(contact, infoX, infoY)
  }

  y += Math.max(logoH, 11.5) + 1.6
  doc.setFillColor(...NAVY)
  doc.rect(MARGIN_X, y, contentWidth, 0.8, 'F')
  doc.setFillColor(...RED)
  doc.rect(MARGIN_X, y + 0.8, contentWidth, 0.4, 'F')
  y += 1.2

  // ------------------------------------------------------------------ meta
  // Two plain columns instead of the old bordered cards — same information,
  // roughly a third of the height.
  const metaTop = y + 4
  const rightColX = MARGIN_X + 112

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.setTextColor(...RED)
  doc.text('BILL TO', MARGIN_X, metaTop)
  doc.text('INVOICE DETAILS', rightColX, metaTop)

  const customerName = bill.customer_name || 'Cash Customer'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(fitFontSize(doc, customerName, META_TEXT_W, [9.5, 9, 8.5, 8, 7.6]))
  doc.setTextColor(...NAVY)
  doc.text(doc.splitTextToSize(customerName, META_TEXT_W)[0], MARGIN_X, metaTop + 4.6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...DARK_TEXT)
  opts.addrLines.forEach((line, i) => {
    doc.text(line, MARGIN_X, metaTop + 8.9 + i * 3.3)
  })
  if (bill.customer_phone) {
    doc.setFont('helvetica', 'bold')
    doc.text(`Ph: ${bill.customer_phone}`, MARGIN_X, metaTop + 8.9 + opts.addrLines.length * 3.3)
  }

  const metaRow = (label: string, value: string, offsetY: number) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(label, rightColX, metaTop + offsetY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.6)
    doc.setTextColor(...NAVY)
    doc.text(value, rightColX + 22, metaTop + offsetY)
  }

  metaRow('Invoice No', bill.bill_number, 4.6)
  metaRow('Date', formatInvoiceDate(bill.bill_date), 8.9)

  y = top + HEAD_H + opts.metaH

  // ----------------------------------------------------------- items table
  doc.setFillColor(...NAVY)
  doc.rect(MARGIN_X, y, contentWidth, THEAD_H, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.setTextColor(255, 255, 255)
  const headBase = y + THEAD_H - 1.9
  doc.text('#', COL.sl, headBase)
  doc.text('ITEM DESCRIPTION', COL.desc, headBase)
  doc.text('QTY', COL.qty, headBase, { align: 'right' })
  doc.text('WEIGHT', COL.kg, headBase, { align: 'right' })
  doc.text('RATE/KG', COL.rate, headBase, { align: 'right' })
  doc.text('AMOUNT', COL.amount, headBase, { align: 'right' })
  y += THEAD_H

  const { rowH } = opts
  const descWidth = COL.qty - COL.desc - 5
  opts.items.forEach((item, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT_BG)
      doc.rect(MARGIN_X, y, contentWidth, rowH, 'F')
    }

    const base = y + rowH - (rowH >= 5 ? 1.8 : 1.4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(rowH >= 5 ? 7.8 : 7)
    doc.setTextColor(...DARK_TEXT)

    doc.text(String(opts.startIndex + i + 1), COL.sl, base)
    doc.text(
      doc.splitTextToSize(item.description || 'Pipe Product', descWidth)[0],
      COL.desc,
      base,
    )
    doc.text(item.quantity_pcs != null ? `${num(item.quantity_pcs)} pcs` : '-', COL.qty, base, {
      align: 'right',
    })
    doc.text(`${num(item.weight_kg)} kg`, COL.kg, base, { align: 'right' })
    doc.text(money(item.price_per_kg), COL.rate, base, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text(money(item.amount), COL.amount, base, { align: 'right' })

    doc.setDrawColor(...BORDER_GRAY)
    doc.setLineWidth(0.15)
    doc.line(MARGIN_X, y + rowH, PAGE_W - MARGIN_X, y + rowH)

    y += rowH
  })

  if (!opts.showTotals) {
    doc.setFont('helvetica', 'bolditalic')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED_TEXT)
    doc.text('Continued on next sheet...', COL.amount, y + 4.4, { align: 'right' })
    return
  }

  // ------------------------------------------------------- quantity totals
  doc.setFillColor(...BAND_BG)
  doc.rect(MARGIN_X, y, contentWidth, QTY_BAND_H, 'F')
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.25)
  doc.rect(MARGIN_X, y, contentWidth, QTY_BAND_H, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...NAVY)
  doc.text('TOTAL', COL.desc, y + QTY_BAND_H - 1.8)
  if (opts.totalPcs > 0) {
    doc.text(`${num(opts.totalPcs)} pcs`, COL.qty, y + QTY_BAND_H - 1.8, { align: 'right' })
  }
  doc.text(`${num(opts.totalKg)} kg`, COL.kg, y + QTY_BAND_H - 1.8, { align: 'right' })
  y += QTY_BAND_H + 2

  // -------------------------------------------------------- money summary
  const sumWidth = 66
  const sumX = PAGE_W - MARGIN_X - sumWidth

  opts.summary.forEach((line) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    doc.setTextColor(...DARK_TEXT)
    doc.text(line.label, sumX, y + SUM_ROW_H - 1.5)
    doc.text(line.value, COL.amount, y + SUM_ROW_H - 1.5, { align: 'right' })
    y += SUM_ROW_H
  })

  doc.setFillColor(...NAVY)
  doc.rect(sumX, y, sumWidth, GRAND_H, 'F')
  doc.setFillColor(...RED)
  doc.rect(sumX, y, 1.8, GRAND_H, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('GRAND TOTAL', sumX + 4.5, y + GRAND_H - 2.9)
  doc.text(`Rs. ${money(bill.grand_total)}`, COL.amount, y + GRAND_H - 2.9, { align: 'right' })

  // Notes sit beside the summary block, in the space it leaves free.
  if (bill.notes) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED_TEXT)
    const noteWidth = sumX - MARGIN_X - 6
    doc.text(doc.splitTextToSize(bill.notes, noteWidth)[0], MARGIN_X, y - 1)
  }

  // ---------------------------------------------------------------- footer
  // Flows directly under the total rather than being pinned to the bottom of
  // the half: pinning it left a dead gap mid-invoice on a short bill. Any
  // slack now collects below the footer, reading as margin instead of a hole.
  const footBase = Math.min(y + GRAND_H + 4.2, top + COPY_H - 1.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...MUTED_TEXT)
  doc.text('Computer-generated invoice. Thank you for your business!', MARGIN_X, footBase)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...NAVY)
  doc.text(`For ${company.businessName}`, COL.amount, footBase, { align: 'right' })
}

export function generateBillPdfDoc(bill: BillRow): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const allItems = normalizeLineItems(bill.line_items)
  const summary = summaryLinesFor(bill)

  const totalPcs = allItems.reduce((sum, i) => sum + (i.quantity_pcs ?? 0), 0)
  const totalKg = allItems.reduce((sum, i) => sum + (i.weight_kg ?? 0), 0)

  const addrLines = wrapAddress(doc, bill.customer_address)
  // Address lines plus the customer's phone line, if any.
  const metaLines = addrLines.length + (bill.customer_phone ? 1 : 0)
  const metaH = META_H_BASE + Math.max(0, metaLines - 1) * META_H_PER_EXTRA_LINE

  // Space left for item rows once the fixed sections are accounted for. The
  // totals overhead is charged to every sheet (not just the last) so each
  // sheet holds the same number of rows and the cut line never moves.
  const overhead =
    HEAD_H + metaH + THEAD_H + QTY_BAND_H + summary.length * SUM_ROW_H + GRAND_H + FOOT_H
  const itemsSpace = COPY_H - overhead
  const perSheet = Math.max(1, Math.floor(itemsSpace / ROW_H_MIN))

  // An empty bill still prints as a valid (zero-item) invoice rather than
  // producing a blank page.
  const sheets: BillLineItem[][] = []
  for (let i = 0; i < allItems.length; i += perSheet) {
    sheets.push(allItems.slice(i, i + perSheet))
  }
  if (sheets.length === 0) sheets.push([])

  sheets.forEach((sheetItems, sheetIndex) => {
    if (sheetIndex > 0) doc.addPage()

    const isLastSheet = sheetIndex === sheets.length - 1
    const rowH = sheetItems.length
      ? Math.min(ROW_H_MAX, Math.max(ROW_H_MIN, itemsSpace / sheetItems.length))
      : ROW_H_MAX

    const opts: CopyOptions = {
      items: sheetItems,
      totalPcs,
      totalKg,
      summary,
      rowH,
      showTotals: isLastSheet,
      sheetLabel: sheets.length > 1 ? `Sheet ${sheetIndex + 1} of ${sheets.length}` : null,
      startIndex: sheetIndex * perSheet,
      addrLines,
      metaH,
    }

    // Two identical copies: top half and bottom half of the same sheet.
    drawInvoiceCopy(doc, bill, MARGIN_Y, opts)
    drawInvoiceCopy(doc, bill, MARGIN_Y + COPY_H + CUT_GUTTER, opts)

    // Cut guide dead-centre, in the gutter between the two copies.
    const cutY = MARGIN_Y + COPY_H + CUT_GUTTER / 2
    doc.setDrawColor(...BORDER_GRAY)
    doc.setLineWidth(0.3)
    doc.setLineDashPattern([1.6, 1.6], 0)
    doc.line(MARGIN_X, cutY, PAGE_W - MARGIN_X, cutY)
    doc.setLineDashPattern([], 0)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...MUTED_TEXT)
    doc.text('cut here', PAGE_W / 2, cutY - 1.2, { align: 'center' })
  })

  return doc
}

export function generateBillPdfBlob(bill: BillRow): {
  blob: Blob
  file: File
  filename: string
  url: string
} {
  const doc = generateBillPdfDoc(bill)
  const filename = `Bill_${bill.bill_number.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`
  const blob = doc.output('blob')
  const file = new File([blob], filename, { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  return { blob, file, filename, url }
}

const CUSTOMER_PAYMENT_APP: Record<string, string> = { phonepe: 'PhonePe', gpay: 'GPay', other: 'Other' }

function customerParticulars(entry: PassbookEntry): string {
  if (entry.bill_number) {
    return `Bill ${entry.bill_number}${entry.bill_total_kg ? ` - ${num(entry.bill_total_kg)} kg pipes` : ''}`
  }
  if (entry.type === 'due') return entry.note ? `Due - ${entry.note}` : 'Due added'
  const mode =
    entry.payment_mode === 'online'
      ? `Online${entry.payment_app ? ` (${CUSTOMER_PAYMENT_APP[entry.payment_app] ?? entry.payment_app})` : ''}`
      : entry.payment_mode === 'cash'
        ? 'Cash'
        : ''
  const base = entry.paid_to_party_name
    ? `Paid to ${entry.paid_to_party_name} (our supplier)`
    : 'Payment received'
  const withMode = mode ? `${base} - ${mode}` : base
  return entry.note ? `${withMode} - ${entry.note}` : withMode
}

/**
 * Customer account statement: every bill and payment, oldest first, with the
 * running balance in words (Due / Advance) — the page a customer is sent to
 * see what they owe and how it was arrived at.
 */
export function generateLedgerStatementDoc(
  customer: CustomerLedgerBalance,
  entries: PassbookEntry[],
  dateRange?: { fromDate: string; toDate: string } | null,
  openingBalance?: number,
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const sortedAsc = [...entries].sort(
    (a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at),
  )
  const periodLabel = dateRange
    ? `${reportDate(dateRange.fromDate)} to ${reportDate(dateRange.toDate)}`
    : 'All Time'

  let y = drawReportHeader(doc, 'Account Statement', periodLabel)
  y = drawPartyBlock(doc, y, 'Statement for', customer.name, customer.phone)

  const billed = sortedAsc.filter((e) => e.type === 'due').reduce((sum, e) => sum + e.amount, 0)
  const received = sortedAsc.filter((e) => e.type === 'received').reduce((sum, e) => sum + e.amount, 0)
  const hasOpening = openingBalance !== undefined && Boolean(dateRange)
  const closing = sortedAsc.length
    ? sortedAsc[sortedAsc.length - 1].running_balance
    : hasOpening
      ? (openingBalance ?? 0)
      : customer.balance
  const closingText = customerBalanceText(closing)

  y = drawKeyFigures(doc, y, [
    ...(hasOpening ? [{ label: 'Opening balance', value: customerBalanceText(openingBalance ?? 0), tone: 'gray' as const }] : []),
    { label: 'Bills', value: rs(billed), tone: 'red', note: `${sortedAsc.filter((e) => e.type === 'due').length} entries` },
    { label: 'Payments received', value: rs(received), tone: 'green', note: `${sortedAsc.filter((e) => e.type === 'received').length} entries` },
    {
      label: closing > 0.004 ? 'Balance due' : closing < -0.004 ? 'Advance with us' : 'Balance',
      value: closing > 0.004 || closing < -0.004 ? rs(Math.abs(closing)) : 'Settled',
      tone: closing > 0.004 ? 'red' : closing < -0.004 ? 'green' : 'navy',
    },
  ])

  const rows: string[][] = []
  if (hasOpening && dateRange) {
    rows.push([reportDate(dateRange.fromDate), 'Opening balance', '', '', customerBalanceText(openingBalance ?? 0)])
  }
  for (const entry of sortedAsc) {
    rows.push([
      reportDate(entry.entry_date),
      customerParticulars(entry),
      entry.type === 'due' ? money(entry.amount) : '',
      entry.type === 'received' ? money(entry.amount) : '',
      customerBalanceText(entry.running_balance),
    ])
  }

  y = drawSectionTitle(doc, y, 'Transactions')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'DATE', x: 2 },
      { header: 'PARTICULARS', x: 22, width: 86 },
      { header: 'BILL AMOUNT', x: 132, align: 'right', color: () => RED },
      { header: 'RECEIVED', x: 156, align: 'right', color: () => GREEN },
      { header: 'BALANCE', x: 184, align: 'right', bold: true, color: balanceTone },
    ],
    rows,
    'No transactions in this period.',
    sortedAsc.length ? ['', 'TOTAL', money(billed), money(received), closingText] : undefined,
  )

  y = drawNote(
    doc,
    y + 1,
    'Bill Amount adds to what is owed; Received reduces it. "Due" is the amount payable to us; "Advance" is extra paid, adjusted against the next bill.',
  )

  drawSummaryBlock(
    doc,
    y,
    [
      ...(hasOpening ? [{ label: 'Opening balance', value: customerBalanceText(openingBalance ?? 0) }] : []),
      { label: '+ Bills', value: rs(billed) },
      { label: '- Payments received', value: rs(received) },
    ],
    {
      label: closing > 0.004 ? 'BALANCE DUE' : closing < -0.004 ? 'ADVANCE' : 'BALANCE',
      value: closing > 0.004 || closing < -0.004 ? rs(Math.abs(closing)) : 'Settled',
    },
  )

  return finishReport(doc)
}

export function generateLedgerStatementBlob(
  customer: CustomerLedgerBalance,
  entries: PassbookEntry[],
  dateRange?: { fromDate: string; toDate: string } | null,
  openingBalance?: number,
): { blob: Blob; file: File; filename: string; url: string } {
  const doc = generateLedgerStatementDoc(customer, entries, dateRange, openingBalance)
  const rangePart = dateRange ? `_${dateRange.fromDate}_to_${dateRange.toDate}` : '_All_Time'
  const filename = `Statement_${customer.name.replace(/[^a-zA-Z0-9_-]/g, '_')}${rangePart}.pdf`
  const blob = doc.output('blob')
  const file = new File([blob], filename, { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  return { blob, file, filename, url }
}

/* ==========================================================================
 * Business reports — Expense/Purchase and Sales
 *
 * Full-page A4 (unlike the two-copy invoice, which is a customer handout):
 * these are internal documents that get filed or shared with an accountant,
 * so they run long and paginate rather than being cut in half.
 * ========================================================================== */

const REPORT_MARGIN = 12
/** Lowest y any report content may reach — the page footer sits below it. */
const REPORT_BOTTOM = 279
const REPORT_W = PAGE_W - REPORT_MARGIN * 2

/** dd-mm-yyyy. The invoice's spelled-out date is too wide for a report table
 *  that carries a row per transaction — it ran into the next column. */
function reportDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

/** What every page of a report repeats: its title and the period it covers. */
type ReportContext = { title: string; periodLabel: string }
const reportContexts = new WeakMap<jsPDF, ReportContext>()

/**
 * First-page header: the logo with the shop's address / phone / GSTIN under
 * it on the left; the report's title, period and generation date on the
 * right; a navy-and-red rule beneath — the logo's own colours.
 */
function drawReportHeader(doc: jsPDF, title: string, periodLabel: string): number {
  reportContexts.set(doc, { title, periodLabel })
  const top = 10
  const logoH = drawLogo(doc, REPORT_MARGIN, top, 62)

  let infoY = top + logoH + 3.6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...DARK_TEXT)
  if (company.address) {
    ;(doc.splitTextToSize(company.address, 100) as string[]).slice(0, 2).forEach((line) => {
      doc.text(line, REPORT_MARGIN, infoY)
      infoY += 3.4
    })
  }
  const contact = companyContactLine()
  if (contact) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text(contact, REPORT_MARGIN, infoY)
    infoY += 3.4
  }

  const right = PAGE_W - REPORT_MARGIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...NAVY)
  doc.text(title.toUpperCase(), right, top + 6, { align: 'right' })
  doc.setFillColor(...RED)
  doc.rect(right - 28, top + 8.2, 28, 0.9, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...DARK_TEXT)
  doc.text(periodLabel, right, top + 13.6, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED_TEXT)
  doc.text(`Generated on ${reportDate(todayISODate())}`, right, top + 17.6, { align: 'right' })

  const ruleY = Math.max(infoY, top + 20.5) + 1
  doc.setFillColor(...NAVY)
  doc.rect(REPORT_MARGIN, ruleY, REPORT_W, 1, 'F')
  doc.setFillColor(...RED)
  doc.rect(REPORT_MARGIN, ruleY + 1, REPORT_W, 0.5, 'F')
  return ruleY + 5
}

/** Slim header for page 2 onwards: small logo, title and period on one line. */
function drawContinuationHeader(doc: jsPDF): number {
  const ctx = reportContexts.get(doc)
  const top = 9
  const logoH = drawLogo(doc, REPORT_MARGIN, top, 36)
  if (ctx) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...NAVY)
    doc.text(ctx.title, PAGE_W - REPORT_MARGIN, top + 4.2, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(`${ctx.periodLabel}  (continued)`, PAGE_W - REPORT_MARGIN, top + 8, { align: 'right' })
  }
  const ruleY = top + logoH + 2
  doc.setFillColor(...NAVY)
  doc.rect(REPORT_MARGIN, ruleY, REPORT_W, 0.6, 'F')
  return ruleY + 5
}

/** Starts a new page, with the continuation header, and returns the y to draw at. */
function newReportPage(doc: jsPDF): number {
  doc.addPage()
  return drawContinuationHeader(doc)
}

/** Moves to a new page when `needed` mm won't fit below `y`. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  return y + needed > REPORT_BOTTOM ? newReportPage(doc) : y
}

/**
 * Footer on every page, drawn once the page count is known: the shop's name
 * on the left, "Page x of y" on the right. Also used for the statements and
 * the bill-free documents, so every PDF ends the same way.
 */
function finishReport(doc: jsPDF): jsPDF {
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    const y = PAGE_H - 9
    doc.setDrawColor(...BORDER_GRAY)
    doc.setLineWidth(0.3)
    doc.line(REPORT_MARGIN, y - 4, PAGE_W - REPORT_MARGIN, y - 4)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...NAVY)
    doc.text(company.businessName, REPORT_MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED_TEXT)
    doc.text('Computer-generated report', PAGE_W / 2, y, { align: 'center' })
    doc.text(`Page ${i} of ${pages}`, PAGE_W - REPORT_MARGIN, y, { align: 'right' })
  }
  return doc
}

type Tone = 'navy' | 'red' | 'green' | 'gray'
const TONE: Record<Tone, Rgb> = { navy: NAVY, red: RED, green: GREEN, gray: MUTED_TEXT }

/** One headline number for the top of a report. */
type KeyFigure = { label: string; value: string; tone?: Tone; note?: string }

/**
 * The figures someone opens the report for, as a row of boxes right under
 * the header — so the answer is on top instead of at the end of the tables.
 */
function drawKeyFigures(doc: jsPDF, y: number, figures: KeyFigure[]): number {
  if (figures.length === 0) return y
  const gap = 3
  const boxW = (REPORT_W - gap * (figures.length - 1)) / figures.length
  const boxH = figures.some((f) => f.note) ? 17 : 14.5
  figures.forEach((f, i) => {
    const x = REPORT_MARGIN + i * (boxW + gap)
    const color = TONE[f.tone ?? 'navy']
    doc.setFillColor(...BAND_BG)
    doc.rect(x, y, boxW, boxH, 'F')
    doc.setFillColor(...color)
    doc.rect(x, y, 1.4, boxH, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(f.label.toUpperCase(), x + 4, y + 4.8)

    doc.setFontSize(fitFontSize(doc, f.value, boxW - 6, [13, 12, 11, 10, 9]))
    // Grey marks a secondary figure: grey bar, but the number stays readable.
    doc.setTextColor(...(f.tone === 'gray' ? DARK_TEXT : color))
    doc.text(f.value, x + 4, y + 11)

    if (f.note) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.8)
      doc.setTextColor(...MUTED_TEXT)
      doc.text(fitToWidth(doc, f.note, boxW - 6), x + 4, y + 15)
    }
  })
  return y + boxH + 3
}

/** A short line of explanation under the header (what the figures mean). */
function drawNote(doc: jsPDF, y: number, text: string): number {
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.6)
  doc.setTextColor(...MUTED_TEXT)
  const lines = doc.splitTextToSize(text, REPORT_W) as string[]
  lines.forEach((line, i) => doc.text(line, REPORT_MARGIN, y + 3 + i * 3.6))
  return y + 3 + lines.length * 3.6
}

type ReportColumn = {
  header: string
  /** x offset from the left margin. */
  x: number
  align?: 'left' | 'right'
  width?: number
  /** Colour for a cell's text — e.g. red for what was billed, green for what was paid. */
  color?: (cell: string, row: string[]) => Rgb | undefined
  bold?: boolean
}

/**
 * One line of `text` that fits `width`, ending in "..." when the value was
 * longer. Cutting silently made a long trading name read as a different,
 * shorter one; the ellipsis says the name continues. Assumes the caller has
 * already set the font it will draw with.
 */
function fitToWidth(doc: jsPDF, text: string, width: number): string {
  const lines = doc.splitTextToSize(text, width) as string[]
  if (lines.length <= 1) return lines[0] ?? ''

  let candidate = lines[0]
  while (candidate.length > 1 && doc.getTextWidth(`${candidate}...`) > width) {
    candidate = candidate.slice(0, -1)
  }
  return `${candidate.trimEnd()}...`
}

const TABLE_HEAD_H = 7
const TABLE_ROW_H = 6.6

/** Shared table renderer for every report, so they stay visually identical
 *  and none has to reimplement paging, banding, or header repetition. A
 *  `totalRow` is drawn bold on a tinted band, closing the table. */
function drawReportTable(
  doc: jsPDF,
  startY: number,
  columns: ReportColumn[],
  rows: string[][],
  emptyMessage: string,
  totalRow?: string[],
): number {
  let y = startY

  const drawHeader = () => {
    doc.setFillColor(...NAVY)
    doc.rect(REPORT_MARGIN, y, REPORT_W, TABLE_HEAD_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.6)
    doc.setTextColor(255, 255, 255)
    columns.forEach((col) => {
      doc.text(col.header, REPORT_MARGIN + col.x, y + 4.7, {
        align: col.align === 'right' ? 'right' : 'left',
      })
    })
    y += TABLE_HEAD_H
  }

  y = ensureSpace(doc, y, TABLE_HEAD_H + TABLE_ROW_H * 2)
  drawHeader()

  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.4)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(emptyMessage, REPORT_MARGIN + 3, y + 5.4)
    doc.setDrawColor(...BORDER_GRAY)
    doc.setLineWidth(0.2)
    doc.line(REPORT_MARGIN, y + 8, PAGE_W - REPORT_MARGIN, y + 8)
    return y + 8
  }

  const drawRow = (row: string[], i: number, isTotal: boolean) => {
    if (y + TABLE_ROW_H > REPORT_BOTTOM) {
      y = newReportPage(doc)
      drawHeader()
    }

    if (isTotal) {
      doc.setFillColor(...BAND_BG)
      doc.rect(REPORT_MARGIN, y, REPORT_W, TABLE_ROW_H + 0.4, 'F')
      doc.setDrawColor(...NAVY)
      doc.setLineWidth(0.4)
      doc.line(REPORT_MARGIN, y, PAGE_W - REPORT_MARGIN, y)
    } else if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT_BG)
      doc.rect(REPORT_MARGIN, y, REPORT_W, TABLE_ROW_H, 'F')
    }

    doc.setFontSize(8.2)
    columns.forEach((col, ci) => {
      const raw = row[ci] ?? ''
      if (!raw) return
      const align = col.align === 'right' ? 'right' : 'left'
      doc.setFont('helvetica', isTotal || col.bold ? 'bold' : 'normal')
      doc.setTextColor(...(isTotal ? NAVY : (col.color?.(raw, row) ?? DARK_TEXT)))
      const text = col.width ? fitToWidth(doc, raw, col.width) : raw
      doc.text(text, REPORT_MARGIN + col.x, y + 4.5, { align })
    })

    if (!isTotal) {
      doc.setDrawColor(...BORDER_GRAY)
      doc.setLineWidth(0.15)
      doc.line(REPORT_MARGIN, y + TABLE_ROW_H, PAGE_W - REPORT_MARGIN, y + TABLE_ROW_H)
    }
    y += TABLE_ROW_H + (isTotal ? 0.4 : 0)
  }

  rows.forEach((row, i) => drawRow(row, i, false))
  if (totalRow) drawRow(totalRow, 0, true)

  return y
}

/** Section heading inside a report: a short red bar and the title. */
function drawSectionTitle(doc: jsPDF, y: number, label: string): number {
  y = ensureSpace(doc, y + 5, 22) // keep a heading with at least a couple of rows
  doc.setFillColor(...RED)
  doc.rect(REPORT_MARGIN, y - 3.2, 1.2, 4.2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text(label, REPORT_MARGIN + 3.2, y)
  return y + 3
}

/** Closing figures, boxed on the right with the main result highlighted. */
function drawSummaryBlock(
  doc: jsPDF,
  y: number,
  rows: { label: string; value: string }[],
  grand: { label: string; value: string },
): number {
  const width = 92
  const x = PAGE_W - REPORT_MARGIN - width
  const rowH = 6
  // Keep the whole block on one page — a summary split across a page break
  // is exactly the part someone flips to first.
  let cursor = ensureSpace(doc, y + 4, rows.length * rowH + 14)

  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.3)
  doc.rect(x, cursor, width, rows.length * rowH + 2, 'S')
  cursor += 1
  rows.forEach((row, i) => {
    if (i > 0) {
      doc.setDrawColor(...ROW_ALT_BG)
      doc.line(x + 2, cursor, x + width - 2, cursor)
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.6)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(row.label, x + 3, cursor + 4.2)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK_TEXT)
    doc.text(row.value, PAGE_W - REPORT_MARGIN - 3, cursor + 4.2, { align: 'right' })
    cursor += rowH
  })
  cursor += 1

  doc.setFillColor(...NAVY)
  doc.rect(x, cursor, width, 10, 'F')
  doc.setFillColor(...RED)
  doc.rect(x, cursor, 1.8, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(255, 255, 255)
  doc.text(grand.label, x + 4.5, cursor + 6.6)
  doc.text(grand.value, PAGE_W - REPORT_MARGIN - 3, cursor + 6.6, { align: 'right' })

  return cursor + 10
}

const rs = (n: number | null | undefined) => `Rs. ${money(n)}`

/** Who a statement is for — name large, phone beside it. */
function drawPartyBlock(doc: jsPDF, y: number, label: string, name: string, detail: string | null): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...RED)
  doc.text(label.toUpperCase(), REPORT_MARGIN, y + 1)
  doc.setFontSize(fitFontSize(doc, name, REPORT_W - 60, [14, 13, 12, 11]))
  doc.setTextColor(...NAVY)
  doc.text(name, REPORT_MARGIN, y + 7.2)
  if (detail) {
    const nameW = doc.getTextWidth(name)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(detail, REPORT_MARGIN + nameW + 4, y + 7.2)
  }
  return y + 12
}

/** "12,000.00 Due" / "500.00 Advance" / "Settled" — a customer's balance in words. */
function customerBalanceText(balance: number): string {
  if (balance > 0.004) return `${money(balance)} Due`
  if (balance < -0.004) return `${money(-balance)} Advance`
  return 'Settled'
}

const balanceTone = (text: string): Rgb =>
  text.endsWith('Due') || text.endsWith('Payable') ? RED : text.endsWith('Advance') ? GREEN : DARK_TEXT

export type ExpenseReportData = {
  purchases: {
    entry_date: string
    supplier: string
    item: string
    quantityKg: number
    ratePerKg: number | null
    purchasePrice: number | null
    transport: number
    total: number | null
  }[]
  salaries: { entry_date: string; category: string; amount: number; notes: string | null }[]
  otherExpenses: { entry_date: string; category: string; amount: number; notes: string | null }[]
  totals: {
    purchaseCost: number
    transport: number
    purchaseTotal: number
    salaries: number
    otherExpenses: number
    grandTotal: number
  }
}

export function generateExpenseReportDoc(
  report: ExpenseReportData,
  periodLabel: string,
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = drawReportHeader(doc, 'Expense Report', periodLabel)
  const t = report.totals
  y = drawKeyFigures(doc, y, [
    { label: 'Total expenses', value: rs(t.grandTotal), tone: 'red' },
    { label: 'Purchases + transport', value: rs(t.purchaseTotal) },
    { label: 'Salaries', value: rs(t.salaries) },
    { label: 'Other expenses', value: rs(t.otherExpenses) },
  ])

  y = drawSectionTitle(doc, y, `Purchases (${report.purchases.length})`)
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'DATE', x: 2 },
      { header: 'SUPPLIER', x: 21, width: 44 },
      { header: 'ITEM', x: 67, width: 34 },
      { header: 'QTY (KG)', x: 120, align: 'right' },
      { header: 'RATE/KG', x: 140, align: 'right' },
      { header: 'TRANSPORT', x: 161, align: 'right' },
      { header: 'TOTAL (Rs.)', x: 184, align: 'right', bold: true },
    ],
    report.purchases.map((p) => [
      reportDate(p.entry_date),
      p.supplier,
      p.item,
      num(p.quantityKg),
      p.ratePerKg === null ? '-' : money(p.ratePerKg),
      money(p.transport),
      p.total === null ? '-' : money(p.total),
    ]),
    'No purchases in this period.',
    report.purchases.length
      ? ['TOTAL', '', '', num(report.purchases.reduce((s, p) => s + p.quantityKg, 0)), '', money(t.transport), money(t.purchaseTotal)]
      : undefined,
  )

  y = drawSectionTitle(doc, y, `Salaries (${report.salaries.length})`)
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'DATE', x: 2 },
      { header: 'TYPE', x: 24, width: 50 },
      { header: 'DESCRIPTION', x: 78, width: 74 },
      { header: 'AMOUNT (Rs.)', x: 184, align: 'right', bold: true },
    ],
    report.salaries.map((s) => [reportDate(s.entry_date), s.category, s.notes ?? '', money(s.amount)]),
    'No salary payments in this period.',
    report.salaries.length ? ['TOTAL', '', '', money(t.salaries)] : undefined,
  )

  y = drawSectionTitle(doc, y, `Other Expenses (${report.otherExpenses.length})`)
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'DATE', x: 2 },
      { header: 'TYPE', x: 24, width: 50 },
      { header: 'DESCRIPTION', x: 78, width: 74 },
      { header: 'AMOUNT (Rs.)', x: 184, align: 'right', bold: true },
    ],
    report.otherExpenses.map((e) => [reportDate(e.entry_date), e.category, e.notes ?? '', money(e.amount)]),
    'No other expenses in this period.',
    report.otherExpenses.length ? ['TOTAL', '', '', money(t.otherExpenses)] : undefined,
  )

  y = drawSectionTitle(doc, y, 'Summary')
  drawSummaryBlock(
    doc,
    y,
    [
      { label: 'Total Purchase Cost', value: `Rs. ${money(report.totals.purchaseCost)}` },
      { label: 'Total Transport', value: `Rs. ${money(report.totals.transport)}` },
      { label: 'Total Salaries', value: `Rs. ${money(report.totals.salaries)}` },
      { label: 'Total Other Expenses', value: `Rs. ${money(report.totals.otherExpenses)}` },
    ],
    { label: 'TOTAL EXPENSES', value: `Rs. ${money(report.totals.grandTotal)}` },
  )

  return finishReport(doc)
}

export type SalesReportData = {
  /** One entry per bill — see SalesReportLine. */
  lines: {
    bill_date: string
    bill_number: string
    customer: string
    weightKg: number
    amount: number
  }[]
  totals: { quantityPcs: number; weightKg: number; salesAmount: number; billCount: number }
}

export function generateSalesReportDoc(report: SalesReportData, periodLabel: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = drawReportHeader(doc, 'Sales Report', periodLabel)
  const t = report.totals
  y = drawKeyFigures(doc, y, [
    { label: 'Total sales', value: rs(t.salesAmount), tone: 'green' },
    { label: 'Bills raised', value: String(t.billCount) },
    { label: 'Weight sold', value: `${num(t.weightKg)} kg` },
    {
      label: 'Average rate',
      value: t.weightKg > 0 ? `${rs(t.salesAmount / t.weightKg)}/kg` : '-',
      tone: 'gray',
    },
  ])

  y = drawSectionTitle(doc, y, `Bills (${report.lines.length})`)
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'S.NO', x: 2 },
      { header: 'DATE', x: 13 },
      { header: 'BILL NO', x: 33 },
      { header: 'CUSTOMER', x: 52, width: 82 },
      { header: 'WEIGHT (KG)', x: 154, align: 'right' },
      { header: 'AMOUNT (Rs.)', x: 184, align: 'right', bold: true },
    ],
    report.lines.map((l, i) => [
      String(i + 1),
      reportDate(l.bill_date),
      l.bill_number,
      l.customer,
      num(l.weightKg),
      money(l.amount),
    ]),
    'No sales in this period.',
    report.lines.length ? ['', '', '', 'TOTAL', num(t.weightKg), money(t.salesAmount)] : undefined,
  )

  y = drawSectionTitle(doc, y, 'Summary')
  drawSummaryBlock(
    doc,
    y,
    [
      { label: 'Bills Raised', value: String(report.totals.billCount) },
      { label: 'Total Quantity Sold', value: `${num(report.totals.quantityPcs)} pcs` },
      { label: 'Total Weight Sold', value: `${num(report.totals.weightKg)} kg` },
    ],
    { label: 'TOTAL SALES', value: `Rs. ${money(report.totals.salesAmount)}` },
  )

  return finishReport(doc)
}

export type RecordsReportData = {
  /** "All Types" or a comma-joined list — printed under the period so the
   *  PDF says which filter produced it, matching the on-screen Type chips. */
  kindsLabel: string
  days: {
    entry_date: string
    lines: (
      | {
          type: 'entry'
          kind: RecordKind
          kindLabel: string
          details: string
          qty: string
          amount: number | null
        }
      | { type: 'subtotal'; label: string; qty: string }
    )[]
    entryCount: number
    amount: number
  }[]
  summary: { label: string; qty: string | null; amount: number | null }[]
  totalEntries: number
}

/** The same colour each kind wears in the app (nav, Home cards, Records
 *  badges), so a printed row is recognisable at a glance the same way. */
const KIND_SWATCH: Record<RecordKind, Rgb> = {
  production: [37, 99, 235],
  sale: [22, 163, 74],
  recycling: [13, 148, 136],
  raw_material_purchase: [234, 88, 12],
  scrap_purchase: [234, 88, 12],
  factory_waste: [100, 116, 139],
  expense: [225, 29, 72],
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "Tuesday, 04 August 2026" — the day heading. Spelled out because this is
 *  the line someone scans for when hunting a particular day. */
function reportDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const day = String(d.getDate()).padStart(2, '0')
  return `${WEEKDAY_NAMES[d.getDay()]}, ${day} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

/** Column geometry, shared by the header and the rows so they can't drift. */
const REC_COL = { sno: 2, type: 12, details: 44, qty: 154, amount: 186 } as const
const REC_DETAILS_W = 82
const REC_ROW_H = 6
const REC_SUBTOTAL_H = 5.8
const REC_DAY_H = 6.4

/**
 * The entries table, grouped under a heading per day rather than repeating the
 * date on every row — the printed report is read a day at a time, the way the
 * Records screen is. Its own renderer (not the shared drawReportTable) because
 * of the day headings and the per-kind colour swatch.
 */
function drawRecordsDays(doc: jsPDF, startY: number, days: RecordsReportData['days']): number {
  const contentWidth = PAGE_W - REPORT_MARGIN * 2
  let y = startY

  const drawColumnHeader = () => {
    doc.setFillColor(...NAVY)
    doc.rect(REPORT_MARGIN, y, contentWidth, 6.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(255, 255, 255)
    doc.text('S.NO', REPORT_MARGIN + REC_COL.sno, y + 4.4)
    doc.text('TYPE', REPORT_MARGIN + REC_COL.type, y + 4.4)
    doc.text('DETAILS', REPORT_MARGIN + REC_COL.details, y + 4.4)
    doc.text('QTY', REPORT_MARGIN + REC_COL.qty, y + 4.4, { align: 'right' })
    doc.text('AMOUNT (Rs.)', REPORT_MARGIN + REC_COL.amount, y + 4.4, { align: 'right' })
    y += 6.5
  }

  const drawDayHeading = (
    day: RecordsReportData['days'][number],
    continued: boolean,
  ) => {
    doc.setFillColor(...BAND_BG)
    doc.rect(REPORT_MARGIN, y, contentWidth, REC_DAY_H, 'F')
    doc.setFillColor(...RED)
    doc.rect(REPORT_MARGIN, y, 1.3, REC_DAY_H, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.4)
    doc.setTextColor(...NAVY)
    doc.text(
      continued ? `${reportDayLabel(day.entry_date)} (continued)` : reportDayLabel(day.entry_date),
      REPORT_MARGIN + 4.5,
      y + 4.4,
    )

    const count = `${day.entryCount} ${day.entryCount === 1 ? 'entry' : 'entries'}`
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.6)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(
      day.amount > 0 ? `${count}  ·  Rs. ${money(day.amount)} spent` : count,
      PAGE_W - REPORT_MARGIN - 2.5,
      y + 4.4,
      { align: 'right' },
    )
    y += REC_DAY_H
  }

  drawColumnHeader()

  if (days.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED_TEXT)
    doc.text('No entries match these filters.', REPORT_MARGIN + 3, y + 5)
    return y + 9
  }

  days.forEach((day, dayIndex) => {
    if (dayIndex > 0) y += 2.5

    // Never leave a day heading stranded at the foot of a page.
    if (y + REC_DAY_H + REC_ROW_H > REPORT_BOTTOM) {
      y = newReportPage(doc)
      drawColumnHeader()
    }
    drawDayHeading(day, false)

    let serial = 0
    day.lines.forEach((line) => {
      const rowH = line.type === 'subtotal' ? REC_SUBTOTAL_H : REC_ROW_H
      if (y + rowH > REPORT_BOTTOM) {
        y = newReportPage(doc)
        drawColumnHeader()
        drawDayHeading(day, true)
      }

      if (line.type === 'subtotal') {
        // Closes the rows above it — a bill's weight, or the day's output.
        doc.setDrawColor(...NAVY)
        doc.setLineWidth(0.35)
        doc.line(REPORT_MARGIN + REC_COL.details, y + 0.4, PAGE_W - REPORT_MARGIN, y + 0.4)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.6)
        doc.setTextColor(...NAVY)
        doc.text(line.label, REPORT_MARGIN + REC_COL.details, y + 4.1)
        doc.text(line.qty, REPORT_MARGIN + REC_COL.qty, y + 4.1, { align: 'right' })
        y += rowH
        return
      }

      serial += 1
      if (serial % 2 === 0) {
        doc.setFillColor(...ROW_ALT_BG)
        doc.rect(REPORT_MARGIN, y, contentWidth, rowH, 'F')
      }

      doc.setFillColor(...KIND_SWATCH[line.kind])
      doc.rect(REPORT_MARGIN + REC_COL.type, y + 2, 1.8, 1.8, 'F')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.8)
      doc.setTextColor(...DARK_TEXT)
      doc.text(String(serial), REPORT_MARGIN + REC_COL.sno, y + 4.2)
      doc.text(line.kindLabel, REPORT_MARGIN + REC_COL.type + 3.2, y + 4.2)
      doc.text(fitToWidth(doc, line.details, REC_DETAILS_W), REPORT_MARGIN + REC_COL.details, y + 4.2)
      doc.text(line.qty, REPORT_MARGIN + REC_COL.qty, y + 4.2, { align: 'right' })
      if (line.amount !== null) {
        doc.text(money(line.amount), REPORT_MARGIN + REC_COL.amount, y + 4.2, { align: 'right' })
      }

      doc.setDrawColor(...BORDER_GRAY)
      doc.setLineWidth(0.15)
      doc.line(REPORT_MARGIN, y + rowH, PAGE_W - REPORT_MARGIN, y + rowH)
      y += rowH
    })
  })

  return y
}

export function generateRecordsReportDoc(report: RecordsReportData, periodLabel: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = drawReportHeader(doc, 'Records Report', periodLabel)
  y = drawKeyFigures(doc, y, [
    { label: 'Entries', value: String(report.totalEntries) },
    { label: 'Days', value: String(report.days.length) },
    ...report.summary.slice(0, 2).map((s) => ({
      label: s.label,
      value: s.amount !== null ? rs(s.amount) : (s.qty ?? '-'),
      tone: 'gray' as const,
    })),
  ])
  y = drawNote(doc, y - 2, `Showing: ${report.kindsLabel}`)

  y = drawSectionTitle(doc, y, 'Day-by-day Entries')
  y = drawRecordsDays(doc, y, report.days)

  y = drawSectionTitle(doc, y, 'Summary')
  drawSummaryBlock(
    doc,
    y,
    report.summary.map((s) => ({
      label: s.label,
      value: s.amount !== null ? `Rs. ${money(s.amount)}` : (s.qty ?? ''),
    })),
    { label: 'TOTAL ENTRIES', value: String(report.totalEntries) },
  )

  return finishReport(doc)
}

function reportBlob(doc: jsPDF, filename: string) {
  const blob = doc.output('blob')
  const file = new File([blob], filename, { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  return { blob, file, filename, url }
}

const slug = (text: string) => text.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')

export function generateExpenseReportBlob(report: ExpenseReportData, periodLabel: string) {
  return reportBlob(
    generateExpenseReportDoc(report, periodLabel),
    `Expense_Report_${slug(periodLabel)}.pdf`,
  )
}

export function generateSalesReportBlob(report: SalesReportData, periodLabel: string) {
  return reportBlob(
    generateSalesReportDoc(report, periodLabel),
    `Sales_Report_${slug(periodLabel)}.pdf`,
  )
}

export function generateRecordsReportBlob(report: RecordsReportData, periodLabel: string) {
  return reportBlob(
    generateRecordsReportDoc(report, periodLabel),
    `Records_Report_${slug(periodLabel)}.pdf`,
  )
}

/**
 * Weekly stock check: what was consumed (at each material's latest price), what was
 * produced (per pipe size), and the result — cost per kg of pipe and waste.
 */
export function generateStockCheckReportDoc(period: StockCheckPeriod): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const periodLabel = stockCheckPeriodLabel(period)
  let y = drawReportHeader(doc, 'Stock Check Report', periodLabel)
  {
    const cpk = costPerKgProduced(period)
    const yp = yieldPercent(period)
    y = drawKeyFigures(doc, y, [
      { label: 'Cost / kg of pipe', value: cpk === null ? '-' : rs(cpk), tone: 'red' },
      { label: 'Pipe produced', value: `${num(period.produced_kg)} kg`, tone: 'green', note: `${num(period.produced_pcs)} pieces` },
      { label: 'Material used', value: `${num(period.consumed_kg)} kg`, note: rs(period.consumed_cost) },
      { label: 'Yield', value: yp === null ? '-' : `${num(yp)}%`, tone: 'gray', note: `Waste ${num(period.waste_kg)} kg` },
    ])
  }

  y = drawSectionTitle(doc, y, 'Materials Consumed')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'MATERIAL', x: 2, width: 34 },
      { header: 'OPENING', x: 56, align: 'right' },
      { header: 'PURCHASED', x: 76, align: 'right' },
      { header: 'RETURNED', x: 94, align: 'right' },
      { header: 'RECYCLED', x: 112, align: 'right' },
      { header: 'CLOSING', x: 130, align: 'right' },
      { header: 'USED (KG)', x: 149, align: 'right' },
      { header: 'RATE', x: 164, align: 'right' },
      { header: 'COST (Rs.)', x: 184, align: 'right' },
    ],
    [
      ...period.materials.map((m) => [
        m.material_name,
        num(m.opening_kg),
        num(m.purchased_kg),
        m.returned_kg ? `-${num(m.returned_kg)}` : '0',
        num(m.recycled_kg),
        num(m.closing_kg),
        num(m.consumed_kg),
        m.consumed_kg ? money(m.consumed_cost / m.consumed_kg) : '-',
        money(m.consumed_cost),
      ]),
    ],
    'No materials counted.',
    period.materials.length
      ? ['TOTAL', '', '', '', '', '', num(period.consumed_kg), '', money(period.consumed_cost)]
      : undefined,
  )

  y = drawSectionTitle(doc, y, 'Pipes Produced')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'S.NO', x: 2 },
      { header: 'PIPE SIZE', x: 14 },
      { header: 'PIECES', x: 150, align: 'right' },
      { header: 'WEIGHT (KG)', x: 184, align: 'right' },
    ],
    [
      ...period.production.map((p, i) => [
        String(i + 1),
        // The PDF font has no "×" glyph.
        formatPipeProductLabel(p.diameter_inches, p.weight_kg).replace('×', 'x'),
        num(p.pcs),
        num(p.kg),
      ]),
    ],
    'No production recorded in this period.',
    period.production.length ? ['', 'TOTAL', num(period.produced_pcs), num(period.produced_kg)] : undefined,
  )

  const perKg = (amount: number) => (period.produced_kg > 0 ? money(amount / period.produced_kg) : '-')
  y = drawSectionTitle(doc, y, 'Running Costs')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'EXPENSE', x: 2, width: 90 },
      { header: 'AMOUNT (Rs.)', x: 150, align: 'right' },
      { header: 'PER KG (Rs.)', x: 184, align: 'right' },
    ],
    [
      ...period.overheads.map((o) => [
        o.units != null ? `${o.category_name} (${num(Number(o.units))} units)` : o.category_name,
        money(Number(o.amount)),
        perKg(Number(o.amount)),
      ]),
    ],
    'No salaries, rent or bills recorded for these days.',
    period.overheads.length ? ['TOTAL', money(period.overhead_cost), perKg(period.overhead_cost)] : undefined,
  )

  const yieldPct = yieldPercent(period)
  const costPerKg = costPerKgProduced(period)
  const materialPerKg = materialCostPerKg(period)
  const runningPerKg = runningCostPerKg(period)
  const wastePct = period.consumed_kg > 0 ? (period.waste_kg / period.consumed_kg) * 100 : null

  y = drawSectionTitle(doc, y, 'Result')
  y = drawSummaryBlock(
    doc,
    y,
    [
      { label: 'Material Consumed', value: `${num(period.consumed_kg)} kg` },
      { label: 'Material Cost', value: `Rs. ${money(period.consumed_cost)}` },
      { label: 'Running Costs', value: `Rs. ${money(period.overhead_cost)}` },
      { label: 'Pipe Produced', value: `${num(period.produced_kg)} kg` },
      { label: 'Material / kg', value: materialPerKg === null ? '-' : `Rs. ${money(materialPerKg)}` },
      { label: 'Running costs / kg', value: runningPerKg === null ? '-' : `Rs. ${money(runningPerKg)}` },
      ...(period.units !== null && period.produced_kg > 0
        ? [{ label: 'Electricity units / kg', value: num(period.units / period.produced_kg) }]
        : []),
      { label: 'Yield', value: yieldPct === null ? '-' : `${num(yieldPct)}%` },
      {
        label: 'Waste (consumed - produced)',
        value: `${num(period.waste_kg)} kg${wastePct === null ? '' : ` (${num(wastePct)}%)`}`,
      },
      { label: 'Factory Waste Recorded', value: `${num(period.factory_waste_kg)} kg` },
    ],
    { label: 'COST / KG PIPE', value: costPerKg === null ? '-' : `Rs. ${money(costPerKg)}` },
  )

  return finishReport(doc)
}

export function stockCheckPeriodLabel(period: StockCheckPeriod): string {
  return `${formatStatementDate(period.prev_count_date)} to ${formatStatementDate(period.count_date)}`
}

export function generateStockCheckReportBlob(period: StockCheckPeriod) {
  return reportBlob(generateStockCheckReportDoc(period), `Stock_Check_${period.count_date}.pdf`)
}

/**
 * The owner's own costing of a week (My Costs) — their material prices,
 * operator pay, electricity and other costs. Only their figures: no app
 * rates or app cost per kg.
 */
export function generateMyCostsReportDoc(period: StockCheckPeriod, myCosts: MyCosts): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const mine = myCostSummary(period, myCosts)
  let y = drawReportHeader(doc, 'My Cost Report', stockCheckPeriodLabel(period))
  y = drawKeyFigures(doc, y, [
    { label: 'Cost / kg of pipe', value: mine.costPerKg === null ? '-' : rs(mine.costPerKg), tone: 'red' },
    { label: 'Total cost', value: rs(mine.totalCost) },
    { label: 'Material cost', value: rs(mine.materialCost), note: `${num(mine.usedKg)} kg used` },
    { label: 'Pipe produced', value: `${num(period.produced_kg)} kg`, tone: 'green' },
  ])

  y = drawSectionTitle(doc, y, 'Materials Used')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'MATERIAL', x: 2, width: 90 },
      { header: 'USED (KG)', x: 130, align: 'right' },
      { header: 'RATE (Rs./KG)', x: 158, align: 'right' },
      { header: 'COST (Rs.)', x: 184, align: 'right' },
    ],
    [
      ...mine.lines.map((l) => [
        l.material.material_name,
        num(l.material.consumed_kg),
        money(l.manualRate ?? l.appRate),
        money(l.cost),
      ]),
    ],
    'No material used.',
    ['TOTAL', num(mine.usedKg), '', money(mine.materialCost)],
  )

  const perKgRow = (label: string, kg: number, rate: number, amount: number) =>
    rate > 0 ? [{ label: `${label} ${num(kg)} kg x Rs. ${money(rate)}`, value: `Rs. ${money(amount)}` }] : []
  y = drawSectionTitle(doc, y, 'Cost to Produce')
  drawSummaryBlock(
    doc,
    y,
    [
      { label: 'Material', value: `Rs. ${money(mine.materialCost)}` },
      ...perKgRow('Operator - pipe', period.produced_kg, myCosts.operatorPipeRate, mine.operatorPipe),
      ...perKgRow('Operator - recycled', period.recycled_used_kg, myCosts.operatorRecycledRate, mine.operatorRecycled),
      ...perKgRow('Electricity - pipe', period.produced_kg, myCosts.electricityPipeRate, mine.electricityPipe),
      ...perKgRow(
        'Electricity - recycled',
        period.recycled_used_kg,
        myCosts.electricityRecycledRate,
        mine.electricityRecycled,
      ),
      ...myCosts.extras.map((e) => ({ label: e.name.slice(0, 30), value: `Rs. ${money(e.amount)}` })),
      ...(myCosts.includeAppExpenses ? [{ label: 'Other expenses', value: `Rs. ${money(mine.appExpenses)}` }] : []),
      { label: 'Total cost', value: `Rs. ${money(mine.totalCost)}` },
      { label: 'Pipe produced', value: `${num(period.produced_kg)} kg` },
    ],
    { label: 'COST / KG PIPE', value: mine.costPerKg === null ? '-' : `Rs. ${money(mine.costPerKg)}` },
  )

  return finishReport(doc)
}

export function generateMyCostsReportBlob(period: StockCheckPeriod, myCosts: MyCosts) {
  return reportBlob(generateMyCostsReportDoc(period, myCosts), `My_Costs_${period.count_date}.pdf`)
}

/**
 * Cost to make 1 kg of pipe over a month: material (latest prices, from stock counts),
 * running costs (expenses counted in the month they're for), and production.
 */
export function generateProductionCostReportDoc(report: ProductionCostReport, periodLabel: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = drawReportHeader(doc, 'Production Cost Report', periodLabel)
  {
    const matPerKg = report.coveredProducedKg > 0 && report.coveredFrom ? report.materialCost / report.coveredProducedKg : null
    const runPerKg = report.producedKg > 0 ? report.overheadCost / report.producedKg : null
    y = drawKeyFigures(doc, y, [
      {
        label: 'Cost / kg of pipe',
        value: matPerKg !== null && runPerKg !== null ? rs(matPerKg + runPerKg) : '-',
        tone: 'red',
      },
      { label: 'Material / kg', value: matPerKg === null ? '-' : rs(matPerKg) },
      { label: 'Running costs / kg', value: runPerKg === null ? '-' : rs(runPerKg) },
      { label: 'Pipe produced', value: `${num(report.producedKg)} kg`, tone: 'green', note: `${num(report.producedPcs)} pieces` },
    ])
  }

  const notes: string[] = []
  if (!report.coveredFrom) notes.push('No stock counts cover this period - material cost is not known.')
  else if (report.coveredTo) {
    notes.push(
      `Material counted for ${reportDate(report.coveredFrom)} to ${reportDate(report.coveredTo)}; material per kg uses the ${num(report.coveredProducedKg)} kg of pipe made on those days.`,
    )
  }
  if (report.isEstimated) notes.push('Part of the material is a share (by pipe made each day) of a stock-check week crossing the month - estimated.')
  if (report.unpricedKg > 0.01) notes.push(`${num(report.unpricedKg)} kg used has no purchase price and is not in the cost.`)
  if (notes.length) y = drawNote(doc, y - 2, notes.join(' '))

  y = drawSectionTitle(doc, y, 'Materials Consumed')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'MATERIAL', x: 2, width: 70 },
      { header: 'USED (KG)', x: 120, align: 'right' },
      { header: 'RATE', x: 150, align: 'right' },
      { header: 'COST (Rs.)', x: 184, align: 'right' },
    ],
    [
      ...report.materials.map((m) => [
        m.material_name,
        num(m.consumed_kg),
        m.consumed_kg ? money(m.consumed_cost / m.consumed_kg) : '-',
        money(m.consumed_cost),
      ]),
    ],
    'No stock counts cover this period.',
    report.materials.length ? ['TOTAL', num(report.materialKg), '', money(report.materialCost)] : undefined,
  )

  const perKg = (amount: number) => (report.producedKg > 0 ? money(amount / report.producedKg) : '-')
  y = drawSectionTitle(doc, y, 'Running Costs')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'EXPENSE', x: 2, width: 90 },
      { header: 'AMOUNT (Rs.)', x: 150, align: 'right' },
      { header: 'PER KG (Rs.)', x: 184, align: 'right' },
    ],
    [
      ...report.overheads.map((o) => [
        o.units !== null ? `${o.name} (${num(o.units)} units)` : o.name,
        money(o.amount),
        perKg(o.amount),
      ]),
    ],
    'No salaries, rent or bills recorded for this period.',
    report.overheads.length ? ['TOTAL', money(report.overheadCost), perKg(report.overheadCost)] : undefined,
  )

  y = drawSectionTitle(doc, y, 'Pipes Produced')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'S.NO', x: 2 },
      { header: 'PIPE SIZE', x: 14 },
      { header: 'PIECES', x: 150, align: 'right' },
      { header: 'WEIGHT (KG)', x: 184, align: 'right' },
    ],
    [
      ...report.production.map((p, i) => [
        String(i + 1),
        formatPipeProductLabel(p.diameter_inches, p.weight_kg).replace('×', 'x'),
        num(p.pcs),
        num(p.kg),
      ]),
    ],
    'No production recorded in this period.',
    report.production.length ? ['', 'TOTAL', num(report.producedPcs), num(report.producedKg)] : undefined,
  )

  const materialPerKg = report.coveredProducedKg > 0 && report.coveredFrom ? report.materialCost / report.coveredProducedKg : null
  const runningPerKg = report.producedKg > 0 ? report.overheadCost / report.producedKg : null
  const total = materialPerKg !== null && runningPerKg !== null ? materialPerKg + runningPerKg : null

  y = drawSectionTitle(doc, y, 'Result')
  y = drawSummaryBlock(
    doc,
    y,
    [
      { label: 'Pipe Produced', value: `${num(report.producedKg)} kg` },
      { label: 'Material / kg', value: materialPerKg === null ? '-' : `Rs. ${money(materialPerKg)}` },
      { label: 'Running costs / kg', value: runningPerKg === null ? '-' : `Rs. ${money(runningPerKg)}` },
      ...(report.units !== null && report.producedKg > 0
        ? [{ label: 'Electricity units / kg', value: num(report.units / report.producedKg) }]
        : []),
    ],
    { label: 'COST / KG PIPE', value: total === null ? '-' : `Rs. ${money(total)}` },
  )

  return finishReport(doc)
}

export function generateProductionCostReportBlob(report: ProductionCostReport, periodLabel: string) {
  return reportBlob(generateProductionCostReportDoc(report, periodLabel), `Production_Cost_${slug(periodLabel)}.pdf`)
}

/** Balance wording for the supplier statement — "Payable" / "Advance" rather
 *  than accounting Cr/Dr, since the owner and supplier both read it. */
function supplierBalanceLabel(balance: number): string {
  if (balance > 0) return `${money(balance)} Payable`
  if (balance < 0) return `${money(-balance)} Advance`
  return 'Settled'
}

function supplierParticulars(entry: SupplierPassbookEntry): string {
  if (entry.kind === 'purchase') {
    const rate = entry.price_per_kg != null ? ` @ Rs. ${money(entry.price_per_kg)}` : ''
    return `Purchase - ${entry.item_name ?? 'Material'} ${num(entry.quantity_kg)} kg${rate}`
  }
  if (entry.kind === 'return') {
    const rate = entry.price_per_kg != null ? ` @ Rs. ${money(entry.price_per_kg)}` : ''
    const base = `Returned - ${entry.item_name ?? 'Material'} ${num(entry.quantity_kg)} kg${rate}`
    return entry.note ? `${base} - ${entry.note}` : base
  }
  if (entry.kind === 'payment' && entry.paid_by_customer_name) {
    return `Paid by customer ${entry.paid_by_customer_name} - ${supplierPaymentModeText(entry.payment_mode, entry.payment_app)}`
  }
  if (entry.kind === 'payment') {
    const parts = [
      `Paid - ${supplierPaymentModeText(entry.payment_mode, entry.payment_app)}`,
      entry.paid_to ? `to ${entry.paid_to}` : null,
    ].filter(Boolean)
    const extras = [
      entry.bank_account,
      entry.reference_no ? `Ref ${entry.reference_no}` : null,
      entry.paid_by ? `by ${entry.paid_by}` : null,
    ].filter(Boolean)
    return extras.length ? `${parts.join(' ')} (${extras.join(', ')})` : parts.join(' ')
  }
  const label = entry.kind === 'refund' ? 'Refund received' : 'Opening / manual due'
  return entry.note ? `${label} - ${entry.note}` : label
}

/**
 * Supplier / scrap dealer statement: every purchase (material cost only) and
 * every payment, oldest first, with the running balance. Paginates like the
 * business reports — an active supplier's history runs well past one page.
 */
export function generateSupplierStatementDoc(
  party: SupplierLedgerBalance,
  entries: SupplierPassbookEntry[],
  dateRange?: { fromDate: string; toDate: string } | null,
  openingBalance?: number,
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  // Passbook RPC returns newest first; a statement reads top-down in time.
  const sortedAsc = [...entries].reverse()
  const periodLabel = dateRange
    ? `${reportDate(dateRange.fromDate)} to ${reportDate(dateRange.toDate)}`
    : sortedAsc.length
      ? `${reportDate(sortedAsc[0].entry_date)} to ${reportDate(sortedAsc[sortedAsc.length - 1].entry_date)}`
      : 'All Time'

  let y = drawReportHeader(doc, 'Supplier Statement', periodLabel)
  y = drawPartyBlock(
    doc,
    y,
    party.party_type === 'supplier' ? 'Raw material supplier' : 'Scrap dealer',
    party.name,
    party.phone,
  )

  const tableRows: string[][] = []
  if (openingBalance !== undefined && dateRange) {
    tableRows.push([
      reportDate(dateRange.fromDate),
      'Opening Balance',
      '',
      '',
      supplierBalanceLabel(openingBalance),
    ])
  }

  for (const entry of sortedAsc) {
    const purchaseCol =
      entry.kind === 'purchase' || entry.kind === 'due'
        ? money(entry.amount)
        : entry.kind === 'return'
          ? `-${money(entry.amount)}`
          : ''
    const paidCol =
      entry.kind === 'payment' ? money(entry.amount) : entry.kind === 'refund' ? `-${money(entry.amount)}` : ''
    tableRows.push([
      reportDate(entry.entry_date),
      supplierParticulars(entry),
      purchaseCol,
      paidCol,
      supplierBalanceLabel(entry.running_balance),
    ])
  }

  const periodPurchased = sortedAsc.reduce((sum, e) => {
    if (e.kind === 'purchase' || e.kind === 'due') return sum + e.amount
    if (e.kind === 'return') return sum - e.amount
    return sum
  }, 0)
  const periodPaid = sortedAsc.reduce((sum, e) => {
    if (e.kind === 'payment') return sum + e.amount
    if (e.kind === 'refund') return sum - e.amount
    return sum
  }, 0)
  const finalBalance =
    sortedAsc.length > 0 ? sortedAsc[sortedAsc.length - 1].running_balance : (openingBalance ?? party.balance)

  y = drawKeyFigures(doc, y, [
    ...(openingBalance !== undefined && dateRange
      ? [{ label: 'Opening balance', value: supplierBalanceLabel(openingBalance), tone: 'gray' as const }]
      : []),
    { label: 'Purchases', value: rs(periodPurchased), tone: 'red', note: 'material cost, after returns' },
    { label: 'Paid to them', value: rs(periodPaid), tone: 'green', note: 'after refunds' },
    {
      label: finalBalance > 0.004 ? 'We owe them' : finalBalance < -0.004 ? 'Advance with them' : 'Balance',
      value: Math.abs(finalBalance) > 0.004 ? rs(Math.abs(finalBalance)) : 'Settled',
      tone: finalBalance > 0.004 ? 'red' : finalBalance < -0.004 ? 'green' : 'navy',
    },
  ])

  // Separate Purchase / Paid columns rather than one signed amount — the
  // sign doesn't survive black-and-white printing or a WhatsApp forward.
  y = drawSectionTitle(doc, y, 'Transactions')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'DATE', x: 2 },
      { header: 'PARTICULARS', x: 22, width: 84 },
      { header: 'PURCHASE', x: 128, align: 'right', color: () => RED },
      { header: 'PAID', x: 151, align: 'right', color: () => GREEN },
      { header: 'BALANCE', x: 184, align: 'right', bold: true, color: balanceTone },
    ],
    tableRows,
    'No purchases or payments yet.',
    sortedAsc.length ? ['', 'TOTAL', money(periodPurchased), money(periodPaid), supplierBalanceLabel(finalBalance)] : undefined,
  )
  y = drawNote(doc, y + 1, '"Payable" is what we still owe the supplier; "Advance" is paid ahead of deliveries. Transport is not included.')

  drawSummaryBlock(
    doc,
    y,
    // The same figures as the boxes at the top, worked out from the rows above.
    [
      ...(openingBalance !== undefined && dateRange
        ? [{ label: 'Opening balance', value: supplierBalanceLabel(openingBalance) }]
        : []),
      { label: '+ Purchases', value: rs(periodPurchased) },
      { label: '- Paid', value: rs(periodPaid) },
    ],
    {
      label: finalBalance < 0 ? 'ADVANCE' : 'PAYABLE',
      value: `Rs. ${money(Math.abs(finalBalance))}`,
    },
  )

  return finishReport(doc)
}

export function generateSupplierStatementBlob(
  party: SupplierLedgerBalance,
  entries: SupplierPassbookEntry[],
  dateRange?: { fromDate: string; toDate: string } | null,
  openingBalance?: number,
) {
  const rangePart = dateRange ? `_${dateRange.fromDate}_to_${dateRange.toDate}` : '_All_Time'
  return reportBlob(
    generateSupplierStatementDoc(party, entries, dateRange, openingBalance),
    `Supplier_Statement_${slug(party.name)}${rangePart}.pdf`,
  )
}

export function generateCustomerLedgerReportDoc(
  balances: CustomerLedgerBalance[],
  periodData: CustomerLedgerPeriodData | null,
  periodLabel: string,
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = drawReportHeader(doc, 'Customer Ledger Report', periodLabel)

  const totalOwed = balances.reduce((sum, c) => sum + Math.max(0, c.balance), 0)
  const totalAdvance = balances.reduce((sum, c) => sum + Math.max(0, -c.balance), 0)
  const owingCount = balances.filter((c) => c.balance > 0.004).length
  y = drawKeyFigures(doc, y, [
    { label: 'Customers owe us', value: rs(totalOwed), tone: 'red', note: `${owingCount} of ${balances.length} customers` },
    ...(periodData
      ? [
          { label: 'Billed in period', value: rs(periodData.totalDue) },
          { label: 'Received in period', value: rs(periodData.totalReceived), tone: 'green' as const },
        ]
      : [{ label: 'Advance with us', value: rs(totalAdvance), tone: 'green' as const }]),
  ])

  const rows = balances.map((c) => {
    const act = periodData?.customerActivity.get(c.customer_id)
    const dueCol = periodData ? (act?.due ? money(act.due) : '-') : money(c.total_due)
    const recvCol = periodData ? (act?.received ? money(act.received) : '-') : money(c.total_received)
    return [c.name, c.phone ?? '-', dueCol, recvCol, customerBalanceText(c.balance)]
  })

  y = drawSectionTitle(doc, y, `Customers (${balances.length})`)
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'CUSTOMER', x: 2, width: 62 },
      { header: 'PHONE', x: 66, width: 30 },
      { header: periodData ? 'BILLED (PERIOD)' : 'TOTAL BILLED', x: 126, align: 'right' },
      { header: periodData ? 'RECEIVED (PERIOD)' : 'TOTAL RECEIVED', x: 155, align: 'right' },
      { header: 'BALANCE', x: 184, align: 'right', bold: true, color: balanceTone },
    ],
    rows,
    'No customers found.',
  )

  drawSummaryBlock(
    doc,
    y,
    periodData
      ? [
          { label: 'Period Billed', value: `Rs. ${money(periodData.totalDue)}` },
          { label: 'Period Received', value: `Rs. ${money(periodData.totalReceived)}` },
        ]
      : [{ label: 'Customers', value: String(balances.length) }],
    {
      label: 'TOTAL OWED',
      value: `Rs. ${money(totalOwed)}`,
    },
  )

  return finishReport(doc)
}

export function generateCustomerLedgerReportBlob(
  balances: CustomerLedgerBalance[],
  periodData: CustomerLedgerPeriodData | null,
  periodLabel: string,
) {
  return reportBlob(
    generateCustomerLedgerReportDoc(balances, periodData, periodLabel),
    `Customer_Ledger_${slug(periodLabel)}.pdf`,
  )
}

export function generateSupplierLedgerReportDoc(
  balances: SupplierLedgerBalance[],
  periodData: SupplierLedgerPeriodData | null,
  periodLabel: string,
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = drawReportHeader(doc, 'Supplier Ledger Report', periodLabel)

  let payableTop = 0
  let advanceTop = 0
  for (const p of balances) {
    if (p.balance > 0) payableTop += p.balance
    else advanceTop -= p.balance
  }
  y = drawKeyFigures(doc, y, [
    {
      label: 'We owe suppliers',
      value: rs(payableTop),
      tone: 'red',
      note: `${balances.filter((p) => p.balance > 0.004).length} of ${balances.length} suppliers`,
    },
    ...(periodData
      ? [
          { label: 'Purchased in period', value: rs(periodData.totalPurchased) },
          { label: 'Paid in period', value: rs(periodData.totalPaid), tone: 'green' as const },
        ]
      : [{ label: 'Advance with them', value: rs(advanceTop), tone: 'green' as const }]),
  ])
  y = drawSectionTitle(doc, y, `Suppliers (${balances.length})`)

  const rows = balances.map((p) => {
    const act = periodData?.partyActivity.get(`${p.party_type}:${p.party_id}`)
    const purchaseCol = periodData ? (act?.purchased ? money(act.purchased) : '-') : money(p.total_purchased)
    const paidCol = periodData ? (act?.paid ? money(act.paid) : '-') : money(p.total_paid)
    return [
      p.name,
      p.party_type === 'supplier' ? 'Raw Material' : 'Scrap Dealer',
      purchaseCol,
      paidCol,
      supplierBalanceLabel(p.balance),
    ]
  })

  y = drawReportTable(
    doc,
    y,
    [
      { header: 'PARTY', x: 2, width: 60 },
      { header: 'TYPE', x: 65, width: 35 },
      { header: periodData ? 'PURCHASED (PERIOD)' : 'TOTAL PURCHASED', x: 125, align: 'right' },
      { header: periodData ? 'PAID (PERIOD)' : 'TOTAL PAID', x: 155, align: 'right' },
      { header: 'BALANCE', x: 184, align: 'right', bold: true, color: balanceTone },
    ],
    rows,
    'No suppliers found.',
  )

  let payable = 0
  let advance = 0
  for (const p of balances) {
    if (p.balance > 0) payable += p.balance
    else advance -= p.balance
  }

  drawSummaryBlock(
    doc,
    y,
    periodData
      ? [
          { label: 'Period Purchases', value: `Rs. ${money(periodData.totalPurchased)}` },
          { label: 'Period Paid', value: `Rs. ${money(periodData.totalPaid)}` },
        ]
      : [{ label: 'Advance With Them', value: `Rs. ${money(advance)}` }],
    {
      label: 'YOU OWE',
      value: `Rs. ${money(payable)}`,
    },
  )

  return finishReport(doc)
}

export function generateSupplierLedgerReportBlob(
  balances: SupplierLedgerBalance[],
  periodData: SupplierLedgerPeriodData | null,
  periodLabel: string,
) {
  return reportBlob(
    generateSupplierLedgerReportDoc(balances, periodData, periodLabel),
    `Supplier_Ledger_${slug(periodLabel)}.pdf`,
  )
}
