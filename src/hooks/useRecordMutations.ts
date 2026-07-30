import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { RecordKind } from './useRecords'

const TABLE_FOR_KIND = {
  production: 'production_entries',
  sale: 'sales_entries',
  recycling: 'recycling_entries',
  raw_material_purchase: 'raw_material_purchases',
  scrap_purchase: 'scrap_purchases',
  factory_waste: 'factory_waste_entries',
} as const satisfies Record<RecordKind, string>

/**
 * Stock is derived, so editing or deleting an entry only needs the affected
 * views re-fetched — the numbers themselves recompute in Postgres.
 */
const STOCK_KEYS_FOR_KIND: Record<RecordKind, string[][]> = {
  production: [['finished_goods_stock']],
  sale: [['finished_goods_stock']],
  recycling: [['raw_material_stock'], ['scrap_stock'], ['finished_goods_stock']],
  raw_material_purchase: [['raw_material_stock']],
  scrap_purchase: [['scrap_stock']],
  factory_waste: [['scrap_stock']],
}

function invalidateForKind(queryClient: QueryClient, kind: RecordKind) {
  queryClient.invalidateQueries({ queryKey: ['records'] })
  queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  queryClient.invalidateQueries({ queryKey: ['production_entries'] })
  for (const queryKey of STOCK_KEYS_FOR_KIND[kind]) {
    queryClient.invalidateQueries({ queryKey })
  }
}

export function useUpdateRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      kind,
      id,
      patch,
    }: {
      kind: RecordKind
      id: string
      patch: Record<string, unknown>
    }) => {
      const { error } = await supabase
        .from(TABLE_FOR_KIND[kind])
        .update(patch as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { kind }) => invalidateForKind(queryClient, kind),
  })
}

export function useDeleteRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ kind, id }: { kind: RecordKind; id: string }) => {
      if (kind === 'sale') {
        // Fetch sale entry to check for linked bill
        const { data: saleRow } = await supabase
          .from('sales_entries')
          .select('id, bill_id')
          .eq('id', id)
          .single()

        const billId = saleRow?.bill_id

        // Delete sale entry
        const { error } = await supabase.from('sales_entries').delete().eq('id', id)
        if (error) throw error

        // If attached to a bill, check if any remaining sales entries exist
        if (billId) {
          const { count } = await supabase
            .from('sales_entries')
            .select('id', { count: 'exact', head: true })
            .eq('bill_id', billId)

          if (count === 0) {
            // Mark bill as voided so sequence remains intact for tax/audit
            await supabase.from('bills').update({ status: 'voided' }).eq('id', billId)
          }
        }
      } else {
        const { error } = await supabase.from(TABLE_FOR_KIND[kind]).delete().eq('id', id)
        if (error) throw error
      }
    },
    onSuccess: (_data, { kind }) => {
      invalidateForKind(queryClient, kind)
      queryClient.invalidateQueries({ queryKey: ['bills'] })
    },
  })
}
