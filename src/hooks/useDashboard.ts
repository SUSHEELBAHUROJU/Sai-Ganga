import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { recentDatesBefore } from '../lib/date'

export type TodaySummary = {
  producedPcs: number
  producedKg: number
  soldPcs: number
  soldKg: number
  purchaseCount: number
  /** Granules produced in kg — bags aren't recorded for direct-total entries. */
  recyclingOutputKg: number
}

/**
 * One RPC call instead of five separate queries (production, sales,
 * two purchase counts, recycling) — the SUMs happen in Postgres via
 * rpc_today_summary, so this is both fewer round trips and less data
 * transferred than fetching every row for the day and reducing in JS.
 */
export function useTodaySummary(date: string) {
  return useQuery({
    queryKey: ['dashboard', 'today_summary', date],
    queryFn: async (): Promise<TodaySummary> => {
      const { data, error } = await supabase.rpc('rpc_today_summary', { p_date: date })
      if (error) throw error
      const row = data?.[0]

      return {
        producedPcs: row?.produced_pcs ?? 0,
        producedKg: row?.produced_kg ?? 0,
        soldPcs: row?.sold_pcs ?? 0,
        soldKg: row?.sold_kg ?? 0,
        purchaseCount: row?.purchase_count ?? 0,
        recyclingOutputKg: row?.recycling_output_kg ?? 0,
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
