import jsPDF from 'jspdf'
import type { BillRow } from '../hooks/useBills'
import type { CompanySettings } from '../hooks/useCompanySettings'
import { formatInvoiceDate } from './date'

/** Helper to convert numbers to Indian Rupees in words */
function numberToWordsRupees(amount: number): string {
  const words = [
    'Zero',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convertTwoDigits(n: number): string {
    if (n < 20) return words[n]
    const unit = n % 10
    return tens[Math.floor(n / 10)] + (unit ? ' ' + words[unit] : '')
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100)
    const rest = n % 100
    let str = ''
    if (hundred > 0) str += words[hundred] + ' Hundred'
    if (rest > 0) str += (hundred > 0 ? ' ' : '') + convertTwoDigits(rest)
    return str
  }

  const integerPart = Math.floor(Math.abs(amount))
  if (integerPart === 0) return 'Rupees Zero Only'

  let result = ''
  const crore = Math.floor(integerPart / 10000000)
  let rem = integerPart % 10000000
  const lakh = Math.floor(rem / 100000)
  rem = rem % 100000
  const thousand = Math.floor(rem / 1000)
  rem = rem % 1000

  if (crore > 0) result += convertThreeDigits(crore) + ' Crore '
  if (lakh > 0) result += convertThreeDigits(lakh) + ' Lakh '
  if (thousand > 0) result += convertThreeDigits(thousand) + ' Thousand '
  if (rem > 0) result += convertThreeDigits(rem)

  return `Rupees ${result.trim()} Only`
}

export function generateBillPdfDoc(bill: BillRow, company: CompanySettings): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = 210
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  let y = 10

  // Brand Palette
  const NAVY = [15, 31, 69] as const // Deep Professional Navy #0F1F45
  const RED = [210, 31, 31] as const // Crimson Red #D21F1F
  const TEAL = [13, 148, 136] as const // Accent Teal #0D9488
  const DARK_TEXT = [30, 41, 59] as const // Dark Slate #1E293B
  const MUTED_TEXT = [100, 116, 139] as const // Slate Gray #64748B
  const CARD_BG = [248, 250, 252] as const // Light Slate Tint #F8FAFC
  const ROW_ALT_BG = [241, 245, 249] as const // Subtle Row Banding #F1F5F9
  const BORDER_GRAY = [226, 232, 240] as const // Border Gray #E2E8F0

  // ==========================================
  // 1. TOP HEADER BAND (Gradient-Style Navy & Red)
  // ==========================================
  const headerHeight = 13
  doc.setFillColor(...NAVY)
  doc.rect(margin, y, contentWidth, headerHeight, 'F')

  // Red accent bar below header band
  doc.setFillColor(...RED)
  doc.rect(margin, y + headerHeight, contentWidth, 1.5, 'F')

  // Company Brand Name inside Top Band (Left side)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(255, 255, 255)
  doc.text((company.business_name || 'SAI GANGA POLYMER INDUSTRIES').toUpperCase(), margin + 4, y + 8.5)

  // "TAX INVOICE" Ribbon/Badge Container (Right side)
  const badgeWidth = 36
  const badgeHeight = 8.5
  const badgeX = pageWidth - margin - badgeWidth - 3
  const badgeY = y + (headerHeight - badgeHeight) / 2

  doc.setFillColor(...RED)
  doc.rect(badgeX, badgeY, badgeWidth, badgeHeight, 'F')
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.3)
  doc.rect(badgeX, badgeY, badgeWidth, badgeHeight, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('TAX INVOICE', badgeX + badgeWidth / 2, badgeY + 5.8, { align: 'center' })

  y += headerHeight + 6.5

  // ==========================================
  // COMPANY DETAILS (Below Header Band)
  // ==========================================
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...NAVY)
  doc.text(company.business_name || 'SAI GANGA POLYMER INDUSTRIES', margin, y)

  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED_TEXT)

  if (company.address) {
    const addressLines = doc.splitTextToSize(company.address, 135)
    doc.text(addressLines, margin, y)
    y += addressLines.length * 4
  }

  const gstPhone = [
    company.gst_number ? `GSTIN: ${company.gst_number}` : '',
    company.phone ? `Contact: ${company.phone}` : '',
  ]
    .filter(Boolean)
    .join('   |   ')

  if (gstPhone) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...DARK_TEXT)
    doc.text(gstPhone, margin, y)
    y += 5.5
  } else {
    y += 2
  }

  // Thin Divider Line
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageWidth - margin, y)

  y += 5.5

  // ==========================================
  // 2. BILL TO & INVOICE DETAILS CARDS (Side-by-Side)
  // ==========================================
  const cardWidth = 89
  const cardHeight = 28
  const leftCardX = margin
  const rightCardX = margin + cardWidth + 8

  // --- LEFT CARD: Customer / Bill To ---
  doc.setFillColor(...CARD_BG)
  doc.rect(leftCardX, y, cardWidth, cardHeight, 'F')
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.3)
  doc.rect(leftCardX, y, cardWidth, cardHeight, 'S')

  // Left card vertical accent bar (Navy)
  doc.setFillColor(...NAVY)
  doc.rect(leftCardX, y, 1.8, cardHeight, 'F')

  let cY = y + 4.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...RED)
  doc.text('BILL TO / CUSTOMER DETAILS:', leftCardX + 5, cY)

  cY += 4.8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text(bill.customer_name || 'Cash Customer', leftCardX + 5, cY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK_TEXT)

  cY += 4.5
  if (bill.customer_address) {
    const custAddrLines = doc.splitTextToSize(bill.customer_address, 80)
    doc.text(custAddrLines[0], leftCardX + 5, cY)
    cY += 3.8
  }
  if (bill.customer_phone) {
    doc.text(`Phone: ${bill.customer_phone}`, leftCardX + 5, cY)
  }

  // --- RIGHT CARD: Invoice Details ---
  doc.setFillColor(...CARD_BG)
  doc.rect(rightCardX, y, cardWidth, cardHeight, 'F')
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.3)
  doc.rect(rightCardX, y, cardWidth, cardHeight, 'S')

  // Right card vertical accent bar (Teal)
  doc.setFillColor(...TEAL)
  doc.rect(rightCardX, y, 1.8, cardHeight, 'F')

  let rY = y + 4.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...RED)
  doc.text('INVOICE DETAILS:', rightCardX + 5, rY)

  rY += 5.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED_TEXT)
  doc.text('Invoice No:', rightCardX + 5, rY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text(bill.bill_number, rightCardX + 26, rY)

  rY += 5.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED_TEXT)
  doc.text('Invoice Date:', rightCardX + 5, rY)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK_TEXT)
  doc.text(formatInvoiceDate(bill.bill_date), rightCardX + 26, rY)

  if (bill.status === 'voided') {
    rY += 5.5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...RED)
    doc.text('STATUS: VOIDED', rightCardX + 5, rY)
  }

  y += cardHeight + 7.5

  // ==========================================
  // 3. ITEMS TABLE
  // ==========================================
  const colX = {
    sl: margin + 4,
    desc: margin + 12,
    pcs: margin + 98,
    kg: margin + 128,
    price: margin + 156,
    amount: pageWidth - margin - 4,
  }

  // Table Header
  const tableHeaderHeight = 8.5
  doc.setFillColor(...NAVY)
  doc.rect(margin, y, contentWidth, tableHeaderHeight, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)

  doc.text('#', colX.sl, y + 5.8)
  doc.text('ITEM DESCRIPTION', colX.desc, y + 5.8)
  doc.text('QTY (PCS)', colX.pcs, y + 5.8, { align: 'right' })
  doc.text('WEIGHT (KG)', colX.kg, y + 5.8, { align: 'right' })
  doc.text('PRICE / KG (Rs.)', colX.price, y + 5.8, { align: 'right' })
  doc.text('AMOUNT (Rs.)', colX.amount, y + 5.8, { align: 'right' })

  y += tableHeaderHeight

  // Table Body Rows
  const lineItems = bill.line_items ?? []
  let totalPcsSum = 0
  let totalKgSum = 0

  lineItems.forEach((item, index) => {
    const rowHeight = 8.5
    const isEven = index % 2 === 0

    if (!isEven) {
      doc.setFillColor(...ROW_ALT_BG)
      doc.rect(margin, y, contentWidth, rowHeight, 'F')
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...DARK_TEXT)

    // Sl No
    doc.text(String(index + 1), colX.sl, y + 5.6)

    // Description
    doc.text(item.description || 'Pipe Product', colX.desc, y + 5.6)

    // Qty (Pcs)
    const pcsVal = item.quantity_pcs != null ? item.quantity_pcs : null
    if (pcsVal != null) totalPcsSum += pcsVal
    doc.text(pcsVal != null ? `${pcsVal} pcs` : '-', colX.pcs, y + 5.6, { align: 'right' })

    // Weight (Kg)
    const kgVal = item.weight_kg || 0
    totalKgSum += kgVal
    doc.text(`${kgVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`, colX.kg, y + 5.6, {
      align: 'right',
    })

    // Price / Kg
    doc.text(`Rs. ${(item.price_per_kg ?? 0).toFixed(2)}`, colX.price, y + 5.6, { align: 'right' })

    // Amount (Emphasized Bold)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text(
      `Rs. ${(item.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      colX.amount,
      y + 5.6,
      { align: 'right' },
    )

    // Row bottom grid line
    doc.setDrawColor(...BORDER_GRAY)
    doc.setLineWidth(0.2)
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight)

    y += rowHeight
  })

  // ==========================================
  // 4. TOTAL QUANTITY ROW (Subtotal Band)
  // ==========================================
  const totalRowHeight = 8
  doc.setFillColor(235, 242, 250)
  doc.rect(margin, y, contentWidth, totalRowHeight, 'F')
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.3)
  doc.rect(margin, y, contentWidth, totalRowHeight, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...NAVY)
  doc.text('TOTAL QUANTITY:', colX.desc, y + 5.4)

  if (totalPcsSum > 0) {
    doc.text(`${totalPcsSum} pcs`, colX.pcs, y + 5.4, { align: 'right' })
  }
  doc.text(`${totalKgSum.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`, colX.kg, y + 5.4, {
    align: 'right',
  })

  y += totalRowHeight + 7.5

  // ==========================================
  // 5. TOTALS SECTION & AMOUNT IN WORDS
  // ==========================================
  const summaryWidth = 75
  const summaryX = pageWidth - margin - summaryWidth
  const leftBoxWidth = contentWidth - summaryWidth - 7

  // --- LEFT BOX: Amount in Words & Notes ---
  const leftBoxHeight = 28
  doc.setFillColor(...CARD_BG)
  doc.rect(margin, y, leftBoxWidth, leftBoxHeight, 'F')
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.3)
  doc.rect(margin, y, leftBoxWidth, leftBoxHeight, 'S')

  // Accent bar on top of amount in words box
  doc.setFillColor(...NAVY)
  doc.rect(margin, y, leftBoxWidth, 1.2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...RED)
  doc.text('AMOUNT IN WORDS:', margin + 4, y + 5.5)

  doc.setFont('helvetica', 'bolditalic')
  doc.setFontSize(8.5)
  doc.setTextColor(...NAVY)
  const wordsText = numberToWordsRupees(bill.grand_total)
  const wordsLines = doc.splitTextToSize(wordsText, leftBoxWidth - 8)
  doc.text(wordsLines, margin + 4, y + 10)

  if (bill.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED_TEXT)
    doc.text('Notes / Terms:', margin + 4, y + 19.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    const noteLine = doc.splitTextToSize(bill.notes, leftBoxWidth - 8)[0]
    doc.text(noteLine, margin + 4, y + 23.5)
  }

  // --- RIGHT BOX: Subtotal, Tax, Discount & GRAND TOTAL ---
  let summaryY = y

  const drawSummaryRow = (
    label: string,
    value: string,
    isGrand = false,
  ) => {
    const lineH = isGrand ? 9.5 : 6.2

    if (isGrand) {
      // Bold Gradient-Like Solid Navy Box for GRAND TOTAL
      doc.setFillColor(...NAVY)
      doc.rect(summaryX, summaryY, summaryWidth, lineH, 'F')

      // Red Accent bar inside Grand Total box
      doc.setFillColor(...RED)
      doc.rect(summaryX, summaryY, 2, lineH, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10.5)
    } else {
      doc.setFillColor(255, 255, 255)
      doc.rect(summaryX, summaryY, summaryWidth, lineH, 'F')
      doc.setDrawColor(...BORDER_GRAY)
      doc.setLineWidth(0.3)
      doc.rect(summaryX, summaryY, summaryWidth, lineH, 'S')
      doc.setTextColor(...DARK_TEXT)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
    }

    const paddingX = 4
    const textY = summaryY + (isGrand ? 6.4 : 4.4)

    doc.text(label, summaryX + paddingX + (isGrand ? 2 : 0), textY)
    doc.text(value, summaryX + summaryWidth - paddingX, textY, { align: 'right' })

    summaryY += lineH
  }

  drawSummaryRow(
    'Subtotal',
    `Rs. ${(bill.subtotal ?? bill.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
  )

  if (bill.discount && bill.discount > 0) {
    drawSummaryRow(
      'Discount',
      `- Rs. ${bill.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    )
  }

  if (bill.tax && bill.tax > 0) {
    drawSummaryRow(
      'Tax / GST',
      `+ Rs. ${bill.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    )
  }

  drawSummaryRow(
    'GRAND TOTAL',
    `Rs. ${(bill.grand_total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    true,
  )

  y = Math.max(y + leftBoxHeight + 8, summaryY + 10)

  // ==========================================
  // 6. FOOTER & AUTHORIZED SIGNATORY
  // ==========================================
  const sigX = pageWidth - margin - 60
  const sigY = 248

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...NAVY)
  doc.text(`For ${company.business_name || 'SAI GANGA POLYMER INDUSTRIES'}`, sigX, sigY)

  // Signature line
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.4)
  doc.line(sigX, sigY + 16, sigX + 55, sigY + 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED_TEXT)
  doc.text('Authorized Signatory', sigX + 27.5, sigY + 20.5, { align: 'center' })

  // Footer Divider Bar & Closing Text
  const footerY = 276

  // Gradient-Style Thin Divider Line
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(0.6)
  doc.line(margin, footerY, pageWidth - margin, footerY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...NAVY)
  doc.text('Thank you for your business with Sai Ganga Polymer Industries!', pageWidth / 2, footerY + 5, {
    align: 'center',
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...MUTED_TEXT)
  doc.text('This is a computer-generated tax invoice.', pageWidth / 2, footerY + 8.5, {
    align: 'center',
  })

  return doc
}

export function generateBillPdfBlob(bill: BillRow, company: CompanySettings): {
  blob: Blob
  file: File
  filename: string
  url: string
} {
  const doc = generateBillPdfDoc(bill, company)
  const filename = `Bill_${bill.bill_number.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`
  const blob = doc.output('blob')
  const file = new File([blob], filename, { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  return { blob, file, filename, url }
}
