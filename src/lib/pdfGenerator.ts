import jsPDF from 'jspdf'
import type { BillRow } from '../hooks/useBills'
import type { CompanySettings } from '../hooks/useCompanySettings'
import { formatDateLabel } from './date'

export function generateBillPdfDoc(bill: BillRow, company: CompanySettings): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = 210
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  let y = 14

  // Brand colors
  const RED = [210, 31, 31] as const
  const NAVY = [15, 31, 69] as const
  const DARK_GRAY = [60, 64, 67] as const
  const LIGHT_GRAY = [245, 247, 250] as const
  const BORDER_GRAY = [220, 224, 230] as const

  // Top header bar (Red & Navy accent)
  doc.setFillColor(...RED)
  doc.rect(margin, y, contentWidth, 3, 'F')
  doc.setFillColor(...NAVY)
  doc.rect(margin, y + 3, contentWidth, 1.5, 'F')

  y += 9

  // Company Name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...NAVY)
  doc.text(company.business_name || 'SAI GANGA POLYMER INDUSTRIES', margin, y)

  // GST & Phone on top right
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...RED)
  doc.text('TAX INVOICE', pageWidth - margin, y, { align: 'right' })

  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...DARK_GRAY)
  if (company.address) {
    const addressLines = doc.splitTextToSize(company.address, 120)
    doc.text(addressLines, margin, y)
    y += addressLines.length * 3.8
  }

  const gstPhone = [
    company.gst_number ? `GSTIN: ${company.gst_number}` : '',
    company.phone ? `Ph: ${company.phone}` : '',
  ]
    .filter(Boolean)
    .join('  |  ')

  if (gstPhone) {
    doc.text(gstPhone, margin, y)
    y += 4.5
  }

  y += 3
  // Divider
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageWidth - margin, y)

  y += 6

  // Bill To & Invoice Info Box
  const boxHeight = 24
  doc.setFillColor(...LIGHT_GRAY)
  doc.rect(margin, y, contentWidth, boxHeight, 'F')
  doc.setDrawColor(...BORDER_GRAY)
  doc.rect(margin, y, contentWidth, boxHeight, 'S')

  const leftColX = margin + 4
  const rightColX = pageWidth / 2 + 10
  let boxY = y + 5

  // Left: Bill To
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...RED)
  doc.text('BILL TO:', leftColX, boxY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...NAVY)
  doc.text(bill.customer_name || 'Cash Customer', leftColX, boxY + 4.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK_GRAY)

  let custDetailsY = boxY + 8.5
  if (bill.customer_address) {
    const custAddrLines = doc.splitTextToSize(bill.customer_address, 80)
    doc.text(custAddrLines[0], leftColX, custDetailsY)
    custDetailsY += 3.8
  }
  if (bill.customer_phone) {
    doc.text(`Ph: ${bill.customer_phone}`, leftColX, custDetailsY)
  }

  // Right: Invoice Info
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...RED)
  doc.text('INVOICE DETAILS:', rightColX, boxY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...DARK_GRAY)
  doc.text(`Bill No: `, rightColX, boxY + 4.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  doc.text(bill.bill_number, rightColX + 13, boxY + 4.5)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK_GRAY)
  doc.text(`Bill Date: ${formatDateLabel(bill.bill_date)}`, rightColX, boxY + 9)
  if (bill.status === 'voided') {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...RED)
    doc.text(`Status: VOIDED`, rightColX, boxY + 13.5)
  }

  y += boxHeight + 8

  // Line items table
  const colX = {
    sl: margin + 2,
    desc: margin + 12,
    qty: margin + 105,
    price: margin + 140,
    amount: pageWidth - margin - 2,
  }

  // Table Header
  const tableHeaderHeight = 7
  doc.setFillColor(...NAVY)
  doc.rect(margin, y, contentWidth, tableHeaderHeight, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(255, 255, 255)

  doc.text('#', colX.sl, y + 4.8)
  doc.text('ITEM DESCRIPTION', colX.desc, y + 4.8)
  doc.text('QTY (KG)', colX.qty, y + 4.8, { align: 'right' })
  doc.text('PRICE / KG (₹)', colX.price, y + 4.8, { align: 'right' })
  doc.text('AMOUNT (₹)', colX.amount, y + 4.8, { align: 'right' })

  y += tableHeaderHeight

  // Table Body Rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)

  const lineItems = bill.line_items ?? []
  lineItems.forEach((item, index) => {
    const rowHeight = 7.5
    const isEven = index % 2 === 0

    if (isEven) {
      doc.setFillColor(255, 255, 255)
    } else {
      doc.setFillColor(...LIGHT_GRAY)
    }
    doc.rect(margin, y, contentWidth, rowHeight, 'F')

    doc.setTextColor(...DARK_GRAY)
    doc.text(String(index + 1), colX.sl, y + 5)
    doc.text(item.description || 'Pipe Product', colX.desc, y + 5)
    doc.text(item.weight_kg ? `${item.weight_kg.toLocaleString()} kg` : '0 kg', colX.qty, y + 5, {
      align: 'right',
    })
    doc.text(`₹${(item.price_per_kg ?? 0).toFixed(2)}`, colX.price, y + 5, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text(`₹${(item.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, colX.amount, y + 5, {
      align: 'right',
    })

    doc.setDrawColor(...BORDER_GRAY)
    doc.setLineWidth(0.2)
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight)

    doc.setFont('helvetica', 'normal')
    y += rowHeight
  })

  y += 6

  // Totals Section (Bottom Right)
  const summaryWidth = 75
  const summaryX = pageWidth - margin - summaryWidth
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
      doc.setTextColor(...DARK_GRAY)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(8.5)
    }

    const paddingX = 3
    doc.text(label, summaryX + paddingX, summaryY + (isGrand ? 5.5 : 4.5))
    doc.text(value, summaryX + summaryWidth - paddingX, summaryY + (isGrand ? 5.5 : 4.5), {
      align: 'right',
    })

    summaryY += lineH
  }

  drawSummaryLine(
    'Subtotal',
    `₹${(bill.subtotal ?? bill.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
  )

  if (bill.discount && bill.discount > 0) {
    drawSummaryLine(
      'Discount',
      `- ₹${bill.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    )
  }

  if (bill.tax && bill.tax > 0) {
    drawSummaryLine(
      'Tax',
      `+ ₹${bill.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    )
  }

  drawSummaryLine(
    'GRAND TOTAL',
    `₹${(bill.grand_total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    true,
    true,
  )

  y = Math.max(y + 20, summaryY + 12)

  // Footer notes & terms
  if (bill.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.text('Notes / Payment Terms:', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK_GRAY)
    const notesLines = doc.splitTextToSize(bill.notes, contentWidth)
    doc.text(notesLines, margin, y + 4)
    y += notesLines.length * 3.8 + 6
  }

  // Footer banner at bottom of page
  const footerY = 280
  doc.setDrawColor(...BORDER_GRAY)
  doc.line(margin, footerY, pageWidth - margin, footerY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...DARK_GRAY)
  doc.text('Thank you for your business!', pageWidth / 2, footerY + 4, { align: 'center' })
  doc.setFontSize(7)
  doc.setTextColor(140, 145, 150)
  doc.text('This is a computer-generated tax invoice.', pageWidth / 2, footerY + 8, {
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
