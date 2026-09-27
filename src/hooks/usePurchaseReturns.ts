import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { invalidateSupplierLedger } from './useSupplierLedger'
import { invalidateStockCheck } from './useStockChecks'

/** Bad material sent back to the supplier. Its money value isn't stored — it
 *  is always quantity × the purchase's rate, so editing the purchase moves it. */
export type PurchaseReturn = {
  id: string
  purchase_id: string
  return_date: string
  quantity_kg: number
  reason: string
  created_at: string
}

function invalidateReturns(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['purchase_returns'] })
  queryClient.invalidateQueries({ queryKey: ['records'] })
  queryClient.invalidateQueries({ queryKey: ['reports'] })
  invalidateSupplierLedger(queryClient)
  invalidateStockCheck(queryClient)
}

export function usePurchaseReturns(purchaseId: string | null) {
  return useQuery({
    queryKey: ['purchase_returns', purchaseId],
    enabled: Boolean(purchaseId),
    queryFn: async (): Promise<PurchaseReturn[]> => {
      if (!purchaseId) return []
      const { data, error } = await supabase
        .from('raw_material_purchase_returns')
        .select('id, purchase_id, return_date, quantity_kg, reason, created_at')
        .eq('purchase_id', purchaseId)
        .order('return_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as PurchaseReturn[]
    },
  })
}

export function useReturnPurchase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { purchase_id: string; return_date: string; quantity_kg: number; reason: string }) => {
      const { error } = await supabase.from('raw_material_purchase_returns').insert(input)
      if (error) throw error
    },
    onSuccess: () => invalidateReturns(queryClient),
  })
}

export function useDeletePurchaseReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('raw_material_purchase_returns').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateReturns(queryClient),
  })
}
