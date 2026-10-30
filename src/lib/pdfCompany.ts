/**
 * The business name the PDFs print in their footer and on the bill's "For …"
 * line, taken from Settings → Billing by AppShell (setPdfCompanyInfo). Kept
 * apart from pdfGenerator so the app shell can set it without loading jsPDF.
 * Address, phone and GSTIN are deliberately not carried: the owner wants none
 * of them on any PDF.
 */
export type PdfCompanyInfo = { businessName: string }

export const pdfCompany: PdfCompanyInfo = { businessName: 'Sai Ganga PVC Pipes & Fittings' }

export function setPdfCompanyInfo(info: Partial<PdfCompanyInfo>): void {
  if (info.businessName?.trim()) pdfCompany.businessName = info.businessName.trim()
}
