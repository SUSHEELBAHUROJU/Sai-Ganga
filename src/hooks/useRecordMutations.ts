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
      const { error } = await supabase.from(TABLE_FOR_KIND[kind]).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { kind }) => invalidateForKind(queryClient, kind),
  })
}
