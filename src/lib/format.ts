export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
}

/**
 * Money the Indian way: "₹1,50,000", "₹82.5", "−₹4,000". Every rupee amount
 * on screen goes through this, so the same number never shows as ₹150000 in
 * one place and ₹1,50,000 in another.
 */
export function formatRupees(n: number): string {
  const value = Math.round((Number(n) || 0) * 100) / 100
  const text = Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })
  return value < 0 ? `−₹${text}` : `₹${text}`
}

export function formatPipeProductLabel(diameterInches: number, weightKg: number): string {
  return `${formatQty(diameterInches)}" × ${formatQty(weightKg)}kg`
}

/**
 * Pipes are counted in pieces but the business thinks in weight — this is the
 * one place that conversion happens, so every kg-primary display (Dashboard,
 * Records, Reports, Stock) derives from the same formula.
 */
export function piecesToKg(pieces: number, weightKgPerPiece: number): number {
  return pieces * weightKgPerPiece
}

/**
 * Purchases are priced per kilogram, so what was paid for the goods follows
 * from the rate and the quantity — derived here (the way piecesToKg is) rather
 * than typed in, so the form, the edit form and the stored total agree.
 * Rounded to paise so the number saved is exactly the number shown.
 */
export function purchaseCost(pricePerKg: number, quantityKg: number): number {
  return Math.round(pricePerKg * quantityKg * 100) / 100
}

/**
 * Scrap a recycling batch used, worked back from the granules it produced and
 * the scrap type's loss % (Settings → Scrap Types): 90 kg at 10% loss used
 * 100 kg. Mirrors the scrap_stock view, which deducts exactly this.
 */
export function scrapUsedForGranules(granulesKg: number, lossPct: number): number {
  if (lossPct >= 100) return granulesKg
  return Math.round((granulesKg / (1 - lossPct / 100)) * 100) / 100
}

/** "kg (pcs)" — the kg figure primary/bold via the caller's own styling, pcs a smaller trailing note. */
export function formatKgWithPcs(kg: number, pcs: number): { kgText: string; pcsText: string } {
  return { kgText: `${formatQty(kg)} kg`, pcsText: `(${formatQty(pcs)} pcs)` }
}
