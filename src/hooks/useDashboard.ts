import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { recentDatesBefore } from '../lib/date'
import { piecesToKg } from '../lib/format'

export type TodaySummary = {
  producedPcs: number
  producedKg: number
  soldPcs: number
  soldKg: number
  purchaseCount: number
  /** Granules produced in kg — bags aren't recorded for direct-total entries. */
  recyclingOutputKg: number
}

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0)
}

type QtyWithWeight = { quantity: number; pipe_products: { weight_kg: number } | null }

function sumPcsAndKg(rows: QtyWithWeight[]): { pcs: number; kg: number } {
  let pcs = 0
  let kg = 0
  for (const row of rows) {
    pcs += row.quantity
    kg += piecesToKg(row.quantity, row.pipe_products?.weight_kg ?? 0)
  }
  return { pcs, kg }
}

export function useTodaySummary(date: string) {
  return useQuery({
    queryKey: ['dashboard', 'today_summary', date],
    queryFn: async (): Promise<TodaySummary> => {
      const [production, sales, rawPurchases, scrapPurchases, recycling] = await Promise.all([
        supabase
          .from('production_entries')
          .select('quantity, pipe_products(weight_kg)')
          .eq('entry_date', date),
        supabase
          .from('sales_entries')
          .select('quantity, pipe_products(weight_kg)')
          .eq('entry_date', date),
        supabase
          .from('raw_material_purchases')
          .select('*', { count: 'exact', head: true })
          .eq('entry_date', date),
        supabase
          .from('scrap_purchases')
          .select('*', { count: 'exact', head: true })
          .eq('entry_date', date),
        supabase
          .from('recycling_entries')
          .select('total_output_kg')
          .eq('entry_date', date),
      ])

      if (production.error) throw production.error
      if (sales.error) throw sales.error
      if (rawPurchases.error) throw rawPurchases.error
      if (scrapPurchases.error) throw scrapPurchases.error
      if (recycling.error) throw recycling.error

      const produced = sumPcsAndKg((production.data ?? []) as unknown as QtyWithWeight[])
      const sold = sumPcsAndKg((sales.data ?? []) as unknown as QtyWithWeight[])

      return {
        producedPcs: produced.pcs,
        producedKg: produced.kg,
        soldPcs: sold.pcs,
        soldKg: sold.kg,
        purchaseCount: (rawPurchases.count ?? 0) + (scrapPurchases.count ?? 0),
        recyclingOutputKg: sumBy(recycling.data ?? [], (r) => r.total_output_kg ?? 0),
      }
    },
  })
}

/**
 * Recent days (ending yesterday) with no production entry — the day-to-day
 * activity most likely to have been forgotten. Purely a gentle prompt; the
 * dashboard lets the user dismiss any of these.
 */
export function useMissedDays(today: string, lookbackDays = 3) {
  return useQuery({
    queryKey: ['dashboard', 'missed_days', today, lookbackDays],
    queryFn: async (): Promise<string[]> => {
      const candidates = recentDatesBefore(today, lookbackDays)
      const earliest = candidates[candidates.length - 1]

      const { data, error } = await supabase
        .from('production_entries')
        .select('entry_date')
        .gte('entry_date', earliest)
        .lt('entry_date', today)
      if (error) throw error

      const daysWithProduction = new Set((data ?? []).map((r) => r.entry_date))
      return candidates.filter((d) => !daysWithProduction.has(d))
    },
  })
}
