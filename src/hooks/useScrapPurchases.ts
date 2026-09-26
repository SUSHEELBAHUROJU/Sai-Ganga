import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { invalidateSupplierLedger } from './useSupplierLedger'

export type NewScrapPurchase = {
  entry_date: string
  /** Optional, like a raw-material purchase's supplier — scrap is often bought
   *  off a walk-in seller nobody wants to add to the dealer list. */
  scrap_dealer_id: string | null
  scrap_type_id: string
  quantity_kg: number
  /** The agreed rate — what the owner actually enters. Mandatory. */
  price_per_kg: number
  /** What was paid for the goods: price_per_kg × quantity_kg, computed for the
   *  user rather than typed. Mandatory. */
  cost: number
  /** Freight, kept separate from cost so total = cost + transport. */
  transport_charges: number
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
      queryClient.invalidateQueries({ queryKey: ['records'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      invalidateSupplierLedger(queryClient)
    },
  })
}
