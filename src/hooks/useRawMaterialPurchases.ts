import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type EntryMode = 'bag' | 'direct_kg'

export type NewRawMaterialPurchase = {
  entry_date: string
  raw_material_type_id: string
  supplier_name: string | null
  entry_mode: EntryMode
  pack_kg: number | null
  num_bags: number | null
  total_qty_kg: number
  cost: number | null
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
    },
  })
}
