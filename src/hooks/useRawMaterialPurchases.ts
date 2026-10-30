import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { invalidateSupplierLedger } from './useSupplierLedger'

export type EntryMode = 'bag' | 'direct_kg'

export type NewRawMaterialPurchase = {
  entry_date: string
  raw_material_type_id: string
  /** Structured supplier — the legacy free-text supplier_name column stays in
   *  the table for rows recorded before suppliers became real entities. */
  supplier_id: string | null
  entry_mode: EntryMode
  pack_kg: number | null
  num_bags: number | null
  total_qty_kg: number
  /** The agreed rate — what the owner actually enters. Mandatory. */
  price_per_kg: number
  /** What was paid for the goods: price_per_kg × total_qty_kg, computed for
   *  the user rather than typed. Mandatory. */
  cost: number
  /** Freight, kept separate from cost so total = cost + transport. */
  transport_charges: number
  notes: string | null
}

/**
 * Splits one delivery's transport across its items by weight, so every kg
 * carries the same freight in landed-cost figures. The paise left over from
 * rounding go on the last item, so the parts add back to the exact total.
 */
export function splitTransportByWeight(transport: number, weightsKg: number[]): number[] {
  const totalKg = weightsKg.reduce((sum, kg) => sum + kg, 0)
  if (transport <= 0 || totalKg <= 0) return weightsKg.map(() => 0)
  const shares = weightsKg.map((kg) => Math.round(((transport * kg) / totalKg) * 100) / 100)
  const assigned = shares.slice(0, -1).reduce((sum, v) => sum + v, 0)
  shares[shares.length - 1] = Math.round((transport - assigned) * 100) / 100
  return shares
}

export function useAddRawMaterialPurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    // One delivery can carry several materials: each becomes its own row (so
    // stock, returns, FIFO costing and the supplier ledger work per material),
    // written in a single insert so the delivery saves whole or not at all.
    mutationFn: async (input: NewRawMaterialPurchase | NewRawMaterialPurchase[]) => {
      const { error } = await supabase.from('raw_material_purchases').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raw_material_purchases'] })
      queryClient.invalidateQueries({ queryKey: ['raw_material_stock'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['records'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      invalidateSupplierLedger(queryClient)
    },
  })
}
