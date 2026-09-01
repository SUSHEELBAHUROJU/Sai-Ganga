import jsPDF from 'jspdf'
import type { BillLineItem, BillRow } from '../hooks/useBills'
import type { CustomerLedgerBalance, PassbookEntry } from '../hooks/useLedger'
import { formatInvoiceDate } from './date'
import { formatQty } from './format'

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

const BUSINESS_NAME = 'Sai Ganga Pipes'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN_X = 10
const MARGIN_Y = 8
/** Blank strip around the cut line so scissors don't clip either copy. */
const CUT_GUTTER = 7
const COPY_H = (PAGE_H - MARGIN_Y * 2 - CUT_GUTTER) / 2

/** Vertical cost of everything in a copy that isn't an item row. */
const HEAD_H = 9.5
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
  doc.setFillColor(...NAVY)
  doc.rect(MARGIN_X, y, contentWidth, 1.4, 'F')
  doc.setFillColor(...RED)
  doc.rect(MARGIN_X, y + 1.4, contentWidth, 0.7, 'F')

  y += 6.6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.setTextColor(...NAVY)
  doc.text(BUSINESS_NAME, MARGIN_X, y)

  // A voided bill must be unmistakable on paper, so it takes over the badge.
  const badgeLabel = isVoided ? 'VOIDED' : 'INVOICE'
  const badgeW = isVoided ? 24 : 22
  const badgeH = 6
  const badgeX = PAGE_W - MARGIN_X - badgeW
  doc.setFillColor(...(isVoided ? RED : NAVY))
  doc.rect(badgeX, y - 4.4, badgeW, badgeH, 'F')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text(badgeLabel, badgeX + badgeW / 2, y - 0.2, { align: 'center' })

  // Sits on the title line, left of the badge — the meta block below has no
  // spare row, and putting it there overlapped the items table header.
  if (opts.sheetLabel) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(opts.sheetLabel, badgeX - 3, y - 0.2, { align: 'right' })
  }

  y += 2.9
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y)

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
  doc.text('Computer-generated invoice.', MARGIN_X, footBase)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...NAVY)
  doc.text(`For ${BUSINESS_NAME}`, COL.amount, footBase, { align: 'right' })
}

export function generateBillPdfDoc(bill: BillRow): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const allItems = normalizeLineItems(bill.line_items)
  const summary = summaryLinesFor(bill)

  const totalPcs = allItems.reduce((sum, i) => sum + (i.quantity_pcs ?? 0), 0)
  const totalKg = allItems.reduce((sum, i) => sum + (i.weight_kg ?? 0), 0)

  const addrLines = wrapAddress(doc, bill.customer_address)
  const metaH =
    META_H_BASE + Math.max(0, addrLines.length - 1) * META_H_PER_EXTRA_LINE

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

/** Plain account-statement PDF for a customer's ledger — kept simple, no address/GST, same as the bill PDF. */
export function generateLedgerStatementDoc(
  customer: CustomerLedgerBalance,
  entries: PassbookEntry[],
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageWidth = 210
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  const NAVY = [15, 31, 69] as const
  const RED = [210, 31, 31] as const
  const TEAL = [13, 148, 136] as const
  const DARK_TEXT = [30, 41, 59] as const
  const MUTED_TEXT = [100, 116, 139] as const
  const ROW_ALT_BG = [241, 245, 249] as const
  const BORDER_GRAY = [226, 232, 240] as const

  let y = 14

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...NAVY)
  doc.text('Sai Ganga Pipes', margin, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED_TEXT)
  doc.text('Account Statement', pageWidth - margin, y, { align: 'right' })

  y += 6
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageWidth - margin, y)

  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...DARK_TEXT)
  doc.text(customer.name, margin, y)
  if (customer.phone) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(customer.phone, margin, y + 5)
  }

  const balance = customer.balance
  const balanceLabel = balance > 0 ? 'DUE' : balance < 0 ? 'ADVANCE' : 'SETTLED'
  const balanceColor: readonly [number, number, number] = balance > 0 ? RED : balance < 0 ? TEAL : DARK_TEXT
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...balanceColor)
  doc.text(
    balance === 0 ? 'SETTLED' : `Rs. ${Math.abs(balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${balanceLabel}`,
    pageWidth - margin,
    y,
    { align: 'right' },
  )

  y += 10

  // Separate "Order Amount" (a bill, increases what they owe) / "Payment
  // Received" (decreases it) columns rather than one signed amount — this
  // goes to the customer, and a lone colored +/- doesn't survive
  // black-and-white printing, WhatsApp image compression, or colorblindness.
  // Color is kept as a secondary cue, not the only signal.
  const colX = {
    date: margin + 2,
    desc: margin + 24,
    gave: pageWidth - margin - 68,
    got: pageWidth - margin - 34,
    balance: pageWidth - margin - 2,
  }

  doc.setFillColor(...NAVY)
  doc.rect(margin, y, contentWidth, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('DATE', colX.date, y + 5.4)
  doc.text('PARTICULARS', colX.desc, y + 5.4)
  doc.setFontSize(6.8)
  doc.text('ORDER AMOUNT', colX.gave, y + 5.4, { align: 'right' })
  doc.text('PAYMENT RECEIVED', colX.got, y + 5.4, { align: 'right' })
  doc.setFontSize(8)
  doc.text('BALANCE', colX.balance, y + 5.4, { align: 'right' })
  y += 8

  const sortedAsc = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))

  sortedAsc.forEach((entry, index) => {
    const rowHeight = 7.5
    if (index % 2 === 1) {
      doc.setFillColor(...ROW_ALT_BG)
      doc.rect(margin, y, contentWidth, rowHeight, 'F')
    }

    const isDue = entry.type === 'due'
    const particulars = entry.bill_number ? `Bill ${entry.bill_number}` : isDue ? 'Due' : 'Payment'

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK_TEXT)
    doc.text(formatInvoiceDate(entry.entry_date), colX.date, y + 5)
    doc.text(particulars, colX.desc, y + 5)

    doc.setFont('helvetica', 'bold')
    if (isDue) {
      doc.setTextColor(...RED)
      doc.text(formatQty(entry.amount), colX.gave, y + 5, { align: 'right' })
    } else {
      doc.setTextColor(...TEAL)
      doc.text(formatQty(entry.amount), colX.got, y + 5, { align: 'right' })
    }

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_TEXT)
    doc.text(formatQty(entry.running_balance), colX.balance, y + 5, { align: 'right' })

    doc.setDrawColor(...BORDER_GRAY)
    doc.setLineWidth(0.2)
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight)

    y += rowHeight
  })

  y += 4
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED_TEXT)
  doc.text(
    'Order Amount = billed to you (increases due) · Payment Received = reduces due',
    margin,
    y,
  )

  return doc
}

export function generateLedgerStatementBlob(
  customer: CustomerLedgerBalance,
  entries: PassbookEntry[],
): { blob: Blob; file: File; filename: string; url: string } {
  const doc = generateLedgerStatementDoc(customer, entries)
  const filename = `Statement_${customer.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
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
const REPORT_BOTTOM = 282

/** dd-mm-yyyy. The invoice's spelled-out date is too wide for a report table
 *  that carries a row per transaction — it ran into the next column. */
function reportDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

type ReportColumn = {
  header: string
  /** x offset from the left margin. */
  x: number
  align?: 'left' | 'right'
  width?: number
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

/** Shared table renderer for both reports, so they stay visually identical
 *  and neither has to reimplement paging, banding, or header repetition. */
function drawReportTable(
  doc: jsPDF,
  startY: number,
  columns: ReportColumn[],
  rows: string[][],
  emptyMessage: string,
): number {
  const contentWidth = PAGE_W - REPORT_MARGIN * 2
  let y = startY

  const drawHeader = () => {
    doc.setFillColor(...NAVY)
    doc.rect(REPORT_MARGIN, y, contentWidth, 6.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(255, 255, 255)
    columns.forEach((col) => {
      doc.text(col.header, REPORT_MARGIN + col.x, y + 4.4, {
        align: col.align === 'right' ? 'right' : 'left',
      })
    })
    y += 6.5
  }

  drawHeader()

  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED_TEXT)
    doc.text(emptyMessage, REPORT_MARGIN + 3, y + 5)
    return y + 9
  }

  const rowH = 6
  rows.forEach((row, i) => {
    if (y + rowH > REPORT_BOTTOM) {
      doc.addPage()
      y = 16
      drawHeader()
    }

    if (i % 2 === 1) {
      doc.setFillColor(...ROW_ALT_BG)
      doc.rect(REPORT_MARGIN, y, contentWidth, rowH, 'F')
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    doc.setTextColor(...DARK_TEXT)

    columns.forEach((col, ci) => {
      const raw = row[ci] ?? ''
      const align = col.align === 'right' ? 'right' : 'left'
      const text = col.width ? fitToWidth(doc, raw, col.width) : raw
      doc.text(text, REPORT_MARGIN + col.x, y + 4.2, { align })
    })

    doc.setDrawColor(...BORDER_GRAY)
    doc.setLineWidth(0.15)
    doc.line(REPORT_MARGIN, y + rowH, PAGE_W - REPORT_MARGIN, y + rowH)
    y += rowH
  })

  return y
}

/** Report title block — business name, report name, and the period covered. */
function drawReportHeader(doc: jsPDF, title: string, periodLabel: string): number {
  const contentWidth = PAGE_W - REPORT_MARGIN * 2
  let y = 14

  doc.setFillColor(...NAVY)
  doc.rect(REPORT_MARGIN, y, contentWidth, 1.4, 'F')
  doc.setFillColor(...RED)
  doc.rect(REPORT_MARGIN, y + 1.4, contentWidth, 0.7, 'F')

  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...NAVY)
  doc.text(BUSINESS_NAME, REPORT_MARGIN, y)

  doc.setFontSize(10)
  doc.text(title, PAGE_W - REPORT_MARGIN, y, { align: 'right' })

  y += 5.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED_TEXT)
  doc.text(`Period: ${periodLabel}`, REPORT_MARGIN, y)

  return y + 6
}

/** Section heading inside a report. */
function drawSectionTitle(doc: jsPDF, y: number, label: string): number {
  const top = y + 6.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...RED)
  doc.text(label.toUpperCase(), REPORT_MARGIN, top)
  return top + 2.5
}

function drawSummaryBlock(
  doc: jsPDF,
  y: number,
  rows: { label: string; value: string }[],
  grand: { label: string; value: string },
): number {
  const width = 84
  const x = PAGE_W - REPORT_MARGIN - width
  let cursor = y + 4

  // Keep the whole block on one page — a summary split across a page break
  // is exactly the part someone flips to first.
  const needed = rows.length * 5.2 + 10
  if (cursor + needed > REPORT_BOTTOM) {
    doc.addPage()
    cursor = 16
  }

  rows.forEach((row) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.2)
    doc.setTextColor(...DARK_TEXT)
    doc.text(row.label, x, cursor + 3.6)
    doc.text(row.value, PAGE_W - REPORT_MARGIN, cursor + 3.6, { align: 'right' })
    cursor += 5.2
  })

  doc.setFillColor(...NAVY)
  doc.rect(x, cursor, width, 9, 'F')
  doc.setFillColor(...RED)
  doc.rect(x, cursor, 1.8, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text(grand.label, x + 4.5, cursor + 6)
  doc.text(grand.value, PAGE_W - REPORT_MARGIN, cursor + 6, { align: 'right' })

  return cursor + 9
}

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

  y = drawSectionTitle(doc, y, 'Purchases')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'DATE', x: 2 },
      { header: 'SUPPLIER', x: 17, width: 38 },
      { header: 'ITEM', x: 57, width: 30 },
      { header: 'QTY (KG)', x: 112, align: 'right' },
      { header: 'RATE/KG', x: 136, align: 'right' },
      { header: 'TRANSPORT', x: 162, align: 'right' },
      { header: 'TOTAL (Rs.)', x: 186, align: 'right' },
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
  )

  y = drawSectionTitle(doc, y, 'Salaries')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'DATE', x: 2 },
      { header: 'AMOUNT (Rs.)', x: 60, align: 'right' },
      { header: 'DESCRIPTION', x: 68, width: 116 },
    ],
    report.salaries.map((s) => [
      reportDate(s.entry_date),
      money(s.amount),
      s.notes ?? '',
    ]),
    'No salary payments in this period.',
  )

  y = drawSectionTitle(doc, y, 'Other Expenses')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'DATE', x: 2 },
      { header: 'TYPE', x: 24, width: 40 },
      { header: 'AMOUNT (Rs.)', x: 100, align: 'right' },
      { header: 'DESCRIPTION', x: 108, width: 78 },
    ],
    report.otherExpenses.map((e) => [
      reportDate(e.entry_date),
      e.category,
      money(e.amount),
      e.notes ?? '',
    ]),
    'No other expenses in this period.',
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

  return doc
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

  y = drawSectionTitle(doc, y, 'Sales')
  y = drawReportTable(
    doc,
    y,
    [
      { header: 'S.NO', x: 2 },
      { header: 'DATE', x: 13 },
      { header: 'BILL', x: 31 },
      { header: 'CUSTOMER', x: 48, width: 84 },
      { header: 'WEIGHT (KG)', x: 152, align: 'right' },
      { header: 'AMOUNT (Rs.)', x: 186, align: 'right' },
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

  return doc
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
