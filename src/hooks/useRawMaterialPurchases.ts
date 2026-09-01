import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

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
  /** What was paid for this purchase, in full. Mandatory. */
  cost: number
  /** Freight, kept separate from cost so total = cost + transport. */
  transport_charges: number
  notes: string | null
}

export function useAddRawMaterialPurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewRawMaterialPurchase) => {
      const { error } = await supabase.from('raw_material_purchases').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['raw_material_purchases'] })
      queryClient.invalidateQueries({ queryKey: ['raw_material_stock'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['records'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
