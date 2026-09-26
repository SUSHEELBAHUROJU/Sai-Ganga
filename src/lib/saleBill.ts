import { piecesToKg, purchaseCost } from './format'

/** A pipe added on the Sale screen, before the bill is generated. */
export type SaleLine = {
  localId: string
  pipeProductId: string
  label: string
  quantity: number
  /** Per-piece weight of the pipe. */
  weightKg: number
}

export function saleLineKg(line: SaleLine): number {
  return piecesToKg(line.quantity, line.weightKg)
}

/** Sales are priced by weight at one rate for the whole bill: kg × rate, rounded to paise. */
export function saleLineAmount(line: SaleLine, ratePerKg: number): number {
  return purchaseCost(ratePerKg, saleLineKg(line))
}
