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
  let y = 12

  // Brand colors
  const RED = [210, 31, 31] as const
  const NAVY = [15, 31, 69] as const
  const DARK_GRAY = [45, 55, 72] as const
  const LIGHT_GRAY = [248, 250, 252] as const
  const BORDER_GRAY = [218, 225, 233] as const

  // Top Accent Header
  doc.setFillColor(...RED)
  doc.rect(margin, y, contentWidth, 3, 'F')
  doc.setFillColor(...NAVY)
  doc.rect(margin, y + 3, contentWidth, 1.5, 'F')

  y += 9

  // Company Name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...NAVY)
  doc.text(company.business_name || 'SAI GANGA POLYMER INDUSTRIES', margin, y)

  // TAX INVOICE Tag top right
  doc.setFillColor(...RED)
  doc.rect(pageWidth - margin - 32, y - 5, 32, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('INVOICE', pageWidth - margin - 16, y - 0.5, { align: 'center' })

  y += 5
  // Subtitle / Address / GST
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK_GRAY)

  if (company.address) {
    const addressLines = doc.splitTextToSize(company.address, 130)
    doc.text(addressLines, margin, y)
    y += addressLines.length * 3.6
  }

  const gstPhone = [
    company.gst_number ? `GSTIN: ${company.gst_number}` : '',
    company.phone ? `Ph: ${company.phone}` : '',
  ]
    .filter(Boolean)
    .join('   |   ')

  if (gstPhone) {
    doc.setFont('helvetica', 'bold')
    doc.text(gstPhone, margin, y)
    y += 4.5
  }

  y += 2
  // Divider
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageWidth - margin, y)

  y += 5

  // Bill To & Invoice Info Box (Two column layout)
  const boxHeight = 25
  doc.setFillColor(...LIGHT_GRAY)
  doc.rect(margin, y, contentWidth, boxHeight, 'F')
  doc.setDrawColor(...BORDER_GRAY)
  doc.rect(margin, y, contentWidth, boxHeight, 'S')

  const leftColX = margin + 4
  const rightColX = pageWidth / 2 + 8
  const boxY = y + 4.5

  // Left: Bill To
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...RED)
  doc.text('BILL TO / CUSTOMER DETAILS:', leftColX, boxY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...NAVY)
  doc.text(bill.customer_name || 'Cash Customer', leftColX, boxY + 4.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK_GRAY)

  let custDetailsY = boxY + 8.5
  if (bill.customer_address) {
    const custAddrLines = doc.splitTextToSize(bill.customer_address, 85)
    doc.text(custAddrLines[0], leftColX, custDetailsY)
    custDetailsY += 3.6
  }
  if (bill.customer_phone) {
    doc.text(`Phone: ${bill.customer_phone}`, leftColX, custDetailsY)
  }

  // Right: Invoice Info
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...RED)
  doc.text('INVOICE DETAILS:', rightColX, boxY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...DARK_GRAY)
  doc.text('Invoice No:', rightColX, boxY + 4.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  doc.text(bill.bill_number, rightColX + 18, boxY + 4.5)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK_GRAY)
  doc.text(`Invoice Date: ${formatInvoiceDate(bill.bill_date)}`, rightColX, boxY + 9)

  if (bill.status === 'voided') {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...RED)
    doc.text('Status: VOIDED', rightColX, boxY + 13.5)
  }

  y += boxHeight + 6

  // Line items table
  // Columns: # | ITEM DESCRIPTION | QTY (PCS) | WEIGHT (KG) | PRICE / KG (Rs.) | AMOUNT (Rs.)
  const colX = {
    sl: margin + 2,
    desc: margin + 10,
    pcs: margin + 95,
    kg: margin + 125,
    price: margin + 155,
    amount: pageWidth - margin - 2,
  }

  // Table Header
  const tableHeaderHeight = 7.5
  doc.setFillColor(...NAVY)
  doc.rect(margin, y, contentWidth, tableHeaderHeight, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)

  doc.text('#', colX.sl, y + 5)
  doc.text('ITEM DESCRIPTION', colX.desc, y + 5)
  doc.text('QTY (PCS)', colX.pcs, y + 5, { align: 'right' })
  doc.text('WEIGHT (KG)', colX.kg, y + 5, { align: 'right' })
  doc.text('PRICE / KG (Rs.)', colX.price, y + 5, { align: 'right' })
  doc.text('AMOUNT (Rs.)', colX.amount, y + 5, { align: 'right' })

  y += tableHeaderHeight

  // Table Body Rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)

  const lineItems = bill.line_items ?? []
  let totalPcsSum = 0
  let totalKgSum = 0

  lineItems.forEach((item, index) => {
    const rowHeight = 7.5
    const isEven = index % 2 === 0

    if (!isEven) {
      doc.setFillColor(...LIGHT_GRAY)
      doc.rect(margin, y, contentWidth, rowHeight, 'F')
    }

    doc.setTextColor(...DARK_GRAY)
    doc.text(String(index + 1), colX.sl, y + 5)
    doc.text(item.description || 'Pipe Product', colX.desc, y + 5)

    const pcsVal = item.quantity_pcs != null ? item.quantity_pcs : null
    if (pcsVal != null) totalPcsSum += pcsVal
    doc.text(pcsVal != null ? `${pcsVal} pcs` : '-', colX.pcs, y + 5, { align: 'right' })

    const kgVal = item.weight_kg || 0
    totalKgSum += kgVal
    doc.text(`${kgVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`, colX.kg, y + 5, { align: 'right' })

    doc.text(`Rs. ${(item.price_per_kg ?? 0).toFixed(2)}`, colX.price, y + 5, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text(`Rs. ${(item.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, colX.amount, y + 5, {
      align: 'right',
    })

    doc.setDrawColor(...BORDER_GRAY)
    doc.setLineWidth(0.2)
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight)

    doc.setFont('helvetica', 'normal')
    y += rowHeight
  })

  // Total Quantity Row
  const totalRowHeight = 7
  doc.setFillColor(235, 240, 248)
  doc.rect(margin, y, contentWidth, totalRowHeight, 'F')
  doc.setDrawColor(...BORDER_GRAY)
  doc.rect(margin, y, contentWidth, totalRowHeight, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...NAVY)
  doc.text('TOTAL QUANTITY:', colX.desc, y + 4.8)

  if (totalPcsSum > 0) {
    doc.text(`${totalPcsSum} pcs`, colX.pcs, y + 4.8, { align: 'right' })
  }
  doc.text(`${totalKgSum.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`, colX.kg, y + 4.8, { align: 'right' })

  y += totalRowHeight + 6

  // Bottom Section: Left = Amount in Words; Right = Totals Summary
  const summaryWidth = 72
  const summaryX = pageWidth - margin - summaryWidth
  const leftBoxWidth = contentWidth - summaryWidth - 6

  // Left Box: Amount in Words & Notes
  doc.setFillColor(...LIGHT_GRAY)
  doc.rect(margin, y, leftBoxWidth, 26, 'F')
  doc.setDrawColor(...BORDER_GRAY)
  doc.rect(margin, y, leftBoxWidth, 26, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...RED)
  doc.text('AMOUNT IN WORDS:', margin + 3, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...NAVY)
  const wordsText = numberToWordsRupees(bill.grand_total)
  const wordsLines = doc.splitTextToSize(wordsText, leftBoxWidth - 6)
  doc.text(wordsLines, margin + 3, y + 9.5)

  if (bill.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...DARK_GRAY)
    doc.text('Notes / Terms:', margin + 3, y + 18)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    const noteLine = doc.splitTextToSize(bill.notes, leftBoxWidth - 6)[0]
    doc.text(noteLine, margin + 3, y + 22)
  }

  // Right Box: Totals Summary
  let summaryY = y

  const drawSummaryLine = (label: string, value: string, bold = false, isGrand = false) => {
    const lineH = isGrand ? 8 : 6
    if (isGrand) {
      doc.setFillColor(...NAVY)
      doc.rect(summaryX, summaryY, summaryWidth, lineH, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
    } else {
      doc.setFillColor(255, 255, 255)
      doc.rect(summaryX, summaryY, summaryWidth, lineH, 'F')
      doc.setDrawColor(...BORDER_GRAY)
      doc.rect(summaryX, summaryY, summaryWidth, lineH, 'S')
      doc.setTextColor(...DARK_GRAY)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(8.5)
    }

    const paddingX = 3
    doc.text(label, summaryX + paddingX, summaryY + (isGrand ? 5.5 : 4.2))
    doc.text(value, summaryX + summaryWidth - paddingX, summaryY + (isGrand ? 5.5 : 4.2), {
      align: 'right',
    })

    summaryY += lineH
  }

  drawSummaryLine(
    'Subtotal',
    `Rs. ${(bill.subtotal ?? bill.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
  )

  if (bill.discount && bill.discount > 0) {
    drawSummaryLine(
      'Discount',
      `- Rs. ${bill.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    )
  }

  if (bill.tax && bill.tax > 0) {
    drawSummaryLine(
      'Tax',
      `+ Rs. ${bill.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    )
  }

  drawSummaryLine(
    'GRAND TOTAL',
    `Rs. ${(bill.grand_total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    true,
    true,
  )

  y = Math.max(y + 32, summaryY + 12)

  // Signature Block at Bottom Right
  const sigX = pageWidth - margin - 65
  const sigY = 250

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...NAVY)
  doc.text(`For ${company.business_name || 'SAI GANGA POLYMER INDUSTRIES'}`, sigX, sigY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...DARK_GRAY)
  doc.text('Authorized Signatory', sigX, sigY + 18)

  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.3)
  doc.line(sigX, sigY + 14, sigX + 55, sigY + 14)

  // Footer Banner
  const footerY = 278
  doc.setDrawColor(...BORDER_GRAY)
  doc.line(margin, footerY, pageWidth - margin, footerY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...NAVY)
  doc.text('Thank you for your business!', pageWidth / 2, footerY + 4, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(140, 145, 150)
  doc.text('This is a computer-generated tax invoice.', pageWidth / 2, footerY + 7.5, {
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
