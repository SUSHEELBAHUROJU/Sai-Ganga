import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { formatPipeProductLabel, piecesToKg } from '../lib/format'

export type ProductMonthTotal = {
  label: string
  producedPcs: number
  producedKg: number
  soldPcs: number
  soldKg: number
}

/** Daily trend point, in kg — the unit production/sales are compared in
 * everywhere else. `day` is a 1-based sequential index into the selected
 * range (not day-of-month), `date` carries the actual calendar date so a
 * range spanning multiple months still labels correctly. */
export type DayPoint = { day: number; date: string; produced: number; sold: number }

export type MonthlyReport = {
  byProduct: ProductMonthTotal[]
  producedTotalPcs: number
  producedTotalKg: number
  soldTotalPcs: number
  soldTotalKg: number
  recyclingOutputKg: number
  rawPurchasedKg: number
  rawPurchasedByType: { label: string; quantity: number }[]
  scrapPurchasedKg: number
  factoryWasteKg: number
  series: DayPoint[]
}

/**
 * Everything here is computed in Postgres (GROUP BY product, GROUP BY day,
 * scalar SUMs) rather than fetched row-by-row and reduced in JS — this range
 * can span up to a year (MAX_QUERY_RANGE_DAYS), so the raw-row approach used
 * to mean downloading a year of entries just to show totals and a chart.
 */
export function useMonthlyReport(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['reports', 'monthly', fromDate, toDate],
    queryFn: async (): Promise<MonthlyReport> => {
      const [production, sales, sums, rawByType, series] = await Promise.all([
        supabase.rpc('rpc_production_totals_by_product', { p_from: fromDate, p_to: toDate }),
        supabase.rpc('rpc_sales_totals_by_product', { p_from: fromDate, p_to: toDate }),
        supabase.rpc('rpc_report_sums', { p_from: fromDate, p_to: toDate }),
        supabase.rpc('rpc_raw_purchases_by_type', { p_from: fromDate, p_to: toDate }),
        supabase.rpc('rpc_daily_series', { p_from: fromDate, p_to: toDate }),
      ])

      for (const result of [production, sales, sums, rawByType, series]) {
        if (result.error) throw result.error
      }

      const byProduct = new Map<string, ProductMonthTotal>()
      for (const row of production.data ?? []) {
        const label = formatPipeProductLabel(row.diameter_inches, row.weight_kg)
        const entry = byProduct.get(label) ?? { label, producedPcs: 0, producedKg: 0, soldPcs: 0, soldKg: 0 }
        entry.producedPcs += row.total_pcs
        entry.producedKg += piecesToKg(row.total_pcs, row.weight_kg)
        byProduct.set(label, entry)
      }
      for (const row of sales.data ?? []) {
        const label = formatPipeProductLabel(row.diameter_inches, row.weight_kg)
        const entry = byProduct.get(label) ?? { label, producedPcs: 0, producedKg: 0, soldPcs: 0, soldKg: 0 }
        entry.soldPcs += row.total_pcs
        entry.soldKg += piecesToKg(row.total_pcs, row.weight_kg)
        byProduct.set(label, entry)
      }

      const reportSums = sums.data?.[0]

      const daySeries: DayPoint[] = (series.data ?? []).map((row, i) => ({
        day: i + 1,
        date: row.entry_date,
        produced: row.produced_kg,
        sold: row.sold_kg,
      }))

      const producedTotals = Array.from(byProduct.values())
      const rawPurchasedByType = (rawByType.data ?? []).map((r) => ({ label: r.label, quantity: r.quantity }))

      return {
        byProduct: producedTotals.sort((a, b) => b.producedKg + b.soldKg - (a.producedKg + a.soldKg)),
        producedTotalPcs: producedTotals.reduce((s, p) => s + p.producedPcs, 0),
        producedTotalKg: producedTotals.reduce((s, p) => s + p.producedKg, 0),
        soldTotalPcs: producedTotals.reduce((s, p) => s + p.soldPcs, 0),
        soldTotalKg: producedTotals.reduce((s, p) => s + p.soldKg, 0),
        recyclingOutputKg: reportSums?.recycling_output_kg ?? 0,
        rawPurchasedKg: reportSums?.raw_purchased_kg ?? 0,
        rawPurchasedByType,
        scrapPurchasedKg: reportSums?.scrap_purchased_kg ?? 0,
        factoryWasteKg: reportSums?.factory_waste_kg ?? 0,
        series: daySeries,
      }
    },
  })
}
