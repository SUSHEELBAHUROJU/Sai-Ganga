import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { formatPipeProductLabel, piecesToKg } from '../lib/format'

export type ProductTotal = { label: string; pcs: number; kg: number }
export type CustomerSaleTotal = { customer: string; lines: ProductTotal[]; totalPcs: number; totalKg: number }
export type PurchaseLine = { label: string; detail: string | null; quantity: number; cost: number | null }

export type DailyReport = {
  production: ProductTotal[]
  productionTotalPcs: number
  productionTotalKg: number
  salesByCustomer: CustomerSaleTotal[]
  salesTotalPcs: number
  salesTotalKg: number
  recyclingOutputKg: number
  recyclingEntryCount: number
  rawPurchases: PurchaseLine[]
  scrapPurchases: PurchaseLine[]
  factoryWasteKg: number
}

function toSortedTotals(rows: { label: string; pcs: number; kg: number }[]): ProductTotal[] {
  return [...rows].sort((a, b) => b.kg - a.kg)
}

/**
 * Production/sales totals and the recycling/purchase/waste sums are computed
 * in Postgres (rpc_production_totals_by_product, rpc_sales_totals_by_..., and
 * rpc_report_sums) rather than downloading every entry row in the range and
 * summing in JS — over a full 366-day range that's the difference between a
 * handful of aggregated rows and potentially thousands of raw entries. Raw
 * material / scrap purchases stay a plain row fetch: the UI lists them
 * individually (supplier, cost per purchase), so there's nothing to
 * aggregate away, but only the columns actually shown are selected.
 */
export function useDailyReport(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['reports', 'daily', fromDate, toDate],
    queryFn: async (): Promise<DailyReport> => {
      const [production, sales, sums, rawPurchases, scrapPurchases] = await Promise.all([
        supabase.rpc('rpc_production_totals_by_product', { p_from: fromDate, p_to: toDate }),
        supabase.rpc('rpc_sales_totals_by_customer_product', { p_from: fromDate, p_to: toDate }),
        supabase.rpc('rpc_report_sums', { p_from: fromDate, p_to: toDate }),
        supabase
          .from('raw_material_purchases')
          .select('total_qty_kg, cost, supplier_name, raw_material_types(name)')
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate),
        supabase
          .from('scrap_purchases')
          .select('quantity_kg, cost, scrap_dealers(name), scrap_types(name)')
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate),
      ])

      for (const result of [production, sales, sums, rawPurchases, scrapPurchases]) {
        if (result.error) throw result.error
      }

      const productionTotals = toSortedTotals(
        (production.data ?? []).map((r) => ({
          label: formatPipeProductLabel(r.diameter_inches, r.weight_kg),
          pcs: r.total_pcs,
          kg: piecesToKg(r.total_pcs, r.weight_kg),
        })),
      )

      const salesByCustomerMap = new Map<string, ProductTotal[]>()
      for (const row of sales.data ?? []) {
        const list = salesByCustomerMap.get(row.customer_name) ?? []
        list.push({
          label: formatPipeProductLabel(row.diameter_inches, row.weight_kg),
          pcs: row.total_pcs,
          kg: piecesToKg(row.total_pcs, row.weight_kg),
        })
        salesByCustomerMap.set(row.customer_name, list)
      }
      const salesByCustomer: CustomerSaleTotal[] = Array.from(salesByCustomerMap.entries())
        .map(([customer, lines]) => {
          const sortedLines = toSortedTotals(lines)
          return {
            customer,
            lines: sortedLines,
            totalPcs: sortedLines.reduce((sum, l) => sum + l.pcs, 0),
            totalKg: sortedLines.reduce((sum, l) => sum + l.kg, 0),
          }
        })
        .sort((a, b) => b.totalKg - a.totalKg)

      const reportSums = sums.data?.[0]

      return {
        production: productionTotals,
        productionTotalPcs: productionTotals.reduce((s, p) => s + p.pcs, 0),
        productionTotalKg: productionTotals.reduce((s, p) => s + p.kg, 0),
        salesByCustomer,
        salesTotalPcs: salesByCustomer.reduce((s, c) => s + c.totalPcs, 0),
        salesTotalKg: salesByCustomer.reduce((s, c) => s + c.totalKg, 0),
        recyclingOutputKg: reportSums?.recycling_output_kg ?? 0,
        recyclingEntryCount: reportSums?.recycling_entry_count ?? 0,
        rawPurchases: (rawPurchases.data ?? []).map((r) => ({
          label: r.raw_material_types?.name ?? 'Unknown material',
          detail: r.supplier_name,
          quantity: r.total_qty_kg,
          cost: r.cost,
        })),
        scrapPurchases: (scrapPurchases.data ?? []).map((r) => ({
          label: r.scrap_types?.name ?? 'Unknown scrap type',
          detail: r.scrap_dealers?.name ?? 'No dealer',
          quantity: r.quantity_kg,
          cost: r.cost,
        })),
        factoryWasteKg: reportSums?.factory_waste_kg ?? 0,
      }
    },
  })
}
