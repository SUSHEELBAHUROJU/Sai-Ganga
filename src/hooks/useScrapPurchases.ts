import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type NewScrapPurchase = {
  entry_date: string
  /** Optional, like a raw-material purchase's supplier — scrap is often bought
   *  off a walk-in seller nobody wants to add to the dealer list. */
  scrap_dealer_id: string | null
  scrap_type_id: string
  quantity_kg: number
  cost: number | null
  notes: string | null
}

export function useAddScrapPurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewScrapPurchase) => {
      const { error } = await supabase.from('scrap_purchases').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrap_purchases'] })
      queryClient.invalidateQueries({ queryKey: ['scrap_stock'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
