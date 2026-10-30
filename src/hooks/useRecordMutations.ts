import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { RecordKind } from './useRecords'
import { invalidateSupplierLedger } from './useSupplierLedger'

const TABLE_FOR_KIND = {
  production: 'production_entries',
  sale: 'sales_entries',
  recycling: 'recycling_entries',
  raw_material_purchase: 'raw_material_purchases',
  scrap_purchase: 'scrap_purchases',
  factory_waste: 'factory_waste_entries',
  expense: 'expenses',
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
  // An expense moves money, not stock — nothing stock-derived to refresh.
  expense: [['expenses']],
}

function invalidateForKind(queryClient: QueryClient, kind: RecordKind) {
  queryClient.invalidateQueries({ queryKey: ['records'] })
  queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  queryClient.invalidateQueries({ queryKey: ['production_entries'] })
  // Purchases and expenses both feed the expense report's totals.
  queryClient.invalidateQueries({ queryKey: ['reports'] })
  // Every kind feeds the stock check: inflows, production, or running costs.
  queryClient.invalidateQueries({ queryKey: ['stock_check_report'] })
  queryClient.invalidateQueries({ queryKey: ['stock_counts'] })
  for (const queryKey of STOCK_KEYS_FOR_KIND[kind]) {
    queryClient.invalidateQueries({ queryKey })
  }
  // The supplier ledger reads purchase cost live — a quantity, rate or
  // supplier change (or a delete) moves the balance.
  if (kind === 'raw_material_purchase' || kind === 'scrap_purchase') {
    invalidateSupplierLedger(queryClient)
  }
}

/**
 * Thrown for a sale line that belongs to a bill. Changing it here would move
 * stock while the bill — and the customer's due — kept the old figures, so
 * such a line is only ever changed through its bill (EditBillModal).
 */
export class BilledSaleError extends Error {
  constructor() {
    super('This sale is on a bill. Use Edit Bill to change or remove it.')
    this.name = 'BilledSaleError'
  }
}

async function assertSaleNotBilled(id: string) {
  const { data, error } = await supabase.from('sales_entries').select('bill_id').eq('id', id).single()
  if (error) throw error
  if (data.bill_id) throw new BilledSaleError()
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
      if (kind === 'sale') await assertSaleNotBilled(id)
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
      if (kind === 'sale') await assertSaleNotBilled(id)
      const { error } = await supabase.from(TABLE_FOR_KIND[kind]).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { kind }) => invalidateForKind(queryClient, kind),
  })
}

/**
 * Re-date a batch of production / recycling entries at once (e.g. a day's
 * output logged under the wrong date). Production rows that land on a date
 * already holding the same pipe are merged into it, the same way adding
 * production merges — see move_entries_date.
 */
export function useMoveEntriesDate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { productionIds: string[]; recyclingIds: string[]; newDate: string }) => {
      const { data, error } = await supabase.rpc('move_entries_date', {
        p_production_ids: input.productionIds,
        p_recycling_ids: input.recyclingIds,
        p_new_date: input.newDate,
      })
      if (error) throw error
      return data?.[0] ?? { moved: 0, merged: 0 }
    },
    onSuccess: () => {
      invalidateForKind(queryClient, 'production')
      invalidateForKind(queryClient, 'recycling')
    },
  })
}
