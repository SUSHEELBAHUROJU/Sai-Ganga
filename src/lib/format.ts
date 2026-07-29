export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
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

/** "kg (pcs)" — the kg figure primary/bold via the caller's own styling, pcs a smaller trailing note. */
export function formatKgWithPcs(kg: number, pcs: number): { kgText: string; pcsText: string } {
  return { kgText: `${formatQty(kg)} kg`, pcsText: `(${formatQty(pcs)} pcs)` }
}
