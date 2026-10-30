/**
 * Company details printed under the logo on every PDF. Filled from
 * Settings → Billing by AppShell (setPdfCompanyInfo), so each PDF carries the
 * same address, phone and GSTIN without every screen passing them in. Kept
 * apart from pdfGenerator so the app shell can set it without loading jsPDF.
 */
export type PdfCompanyInfo = {
  businessName: string
  address: string
  phone: string | null
  gstNumber: string
}

export const pdfCompany: PdfCompanyInfo = {
  businessName: 'Sai Ganga PVC Pipes & Fittings',
  address: '',
  phone: null,
  gstNumber: '',
}

export function setPdfCompanyInfo(info: Partial<PdfCompanyInfo>): void {
  if (info.businessName?.trim()) pdfCompany.businessName = info.businessName.trim()
  if (info.address !== undefined) pdfCompany.address = info.address?.trim() ?? ''
  if (info.phone !== undefined) pdfCompany.phone = info.phone?.trim() || null
  if (info.gstNumber !== undefined) pdfCompany.gstNumber = info.gstNumber?.trim() ?? ''
}

/** "Ph: 98…   |   GSTIN: 36…" — whichever of the two are set. */
export function companyContactLine(): string {
  return [
    pdfCompany.phone ? `Ph: ${pdfCompany.phone}` : null,
    pdfCompany.gstNumber ? `GSTIN: ${pdfCompany.gstNumber}` : null,
  ]
    .filter(Boolean)
    .join('   |   ')
}
