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

type PipeRef = { diameter_inches: number; weight_kg: number } | null

function accumulate(map: Map<string, ProductTotal>, label: string, pcs: number, weightKg: number) {
  const existing = map.get(label) ?? { label, pcs: 0, kg: 0 }
  existing.pcs += pcs
  existing.kg += piecesToKg(pcs, weightKg)
  map.set(label, existing)
}

function toSortedTotals(map: Map<string, ProductTotal>): ProductTotal[] {
  return Array.from(map.values()).sort((a, b) => b.kg - a.kg)
}

export function useDailyReport(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['reports', 'daily', fromDate, toDate],
    queryFn: async (): Promise<DailyReport> => {
      const inRange = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
        q: T,
      ) => q.gte('entry_date', fromDate).lte('entry_date', toDate)

      const [production, sales, recycling, rawPurchases, scrapPurchases, factoryWaste] =
        await Promise.all([
          inRange(
            supabase
              .from('production_entries')
              .select('quantity, pipe_products(diameter_inches, weight_kg)'),
          ),
          inRange(
            supabase
              .from('sales_entries')
              .select('quantity, pipe_products(diameter_inches, weight_kg), customers(name)'),
          ),
          inRange(
            supabase
              .from('recycling_entries')
              .select('total_output_kg'),
          ),
          inRange(
            supabase
              .from('raw_material_purchases')
              .select('total_qty_kg, cost, supplier_name, raw_material_types(name)'),
          ),
          inRange(
            supabase.from('scrap_purchases').select('quantity_kg, cost, scrap_dealers(name), scrap_types(name)'),
          ),
          inRange(supabase.from('factory_waste_entries').select('quantity_kg')),
        ])

      for (const result of [
        production,
        sales,
        recycling,
        rawPurchases,
        scrapPurchases,
        factoryWaste,
      ]) {
        if (result.error) throw result.error
      }

      const productionMap = new Map<string, ProductTotal>()
      for (const row of (production.data ?? []) as unknown as {
        quantity: number
        pipe_products: PipeRef
      }[]) {
        const p = row.pipe_products
        accumulate(
          productionMap,
          p ? formatPipeProductLabel(p.diameter_inches, p.weight_kg) : 'Unknown product',
          row.quantity,
          p?.weight_kg ?? 0,
        )
      }

      // Sales nest product totals under each customer.
      const salesMap = new Map<string, Map<string, ProductTotal>>()
      for (const row of (sales.data ?? []) as unknown as {
        quantity: number
        pipe_products: PipeRef
        customers: { name: string } | null
      }[]) {
        const customer = row.customers?.name ?? 'No customer'
        const p = row.pipe_products
        const label = p ? formatPipeProductLabel(p.diameter_inches, p.weight_kg) : 'Unknown product'
        const perCustomer = salesMap.get(customer) ?? new Map<string, ProductTotal>()
        accumulate(perCustomer, label, row.quantity, p?.weight_kg ?? 0)
        salesMap.set(customer, perCustomer)
      }

      const salesByCustomer: CustomerSaleTotal[] = Array.from(salesMap.entries())
        .map(([customer, lines]) => {
          const productLines = toSortedTotals(lines)
          return {
            customer,
            lines: productLines,
            totalPcs: productLines.reduce((sum, l) => sum + l.pcs, 0),
            totalKg: productLines.reduce((sum, l) => sum + l.kg, 0),
          }
        })
        .sort((a, b) => b.totalKg - a.totalKg)

      const recyclingRows = (recycling.data ?? []) as unknown as {
        total_output_kg: number | null
      }[]
      const sum = <T>(rows: T[], pick: (r: T) => number) =>
        rows.reduce((total, r) => total + pick(r), 0)

      const productionTotals = toSortedTotals(productionMap)

      return {
        production: productionTotals,
        productionTotalPcs: sum(productionTotals, (v) => v.pcs),
        productionTotalKg: sum(productionTotals, (v) => v.kg),
        salesByCustomer,
        salesTotalPcs: salesByCustomer.reduce((s, c) => s + c.totalPcs, 0),
        salesTotalKg: salesByCustomer.reduce((s, c) => s + c.totalKg, 0),
        recyclingOutputKg: sum(recyclingRows, (r) => r.total_output_kg ?? 0),
        recyclingEntryCount: recyclingRows.length,
        rawPurchases: (
          (rawPurchases.data ?? []) as unknown as {
            total_qty_kg: number
            cost: number | null
            supplier_name: string | null
            raw_material_types: { name: string } | null
          }[]
        ).map((r) => ({
          label: r.raw_material_types?.name ?? 'Unknown material',
          detail: r.supplier_name,
          quantity: r.total_qty_kg,
          cost: r.cost,
        })),
        scrapPurchases: (
          (scrapPurchases.data ?? []) as unknown as {
            quantity_kg: number
            cost: number | null
            scrap_dealers: { name: string } | null
            scrap_types: { name: string } | null
          }[]
        ).map((r) => ({
          label: r.scrap_types?.name ?? 'Unknown scrap type',
          detail: r.scrap_dealers?.name ?? 'No dealer',
          quantity: r.quantity_kg,
          cost: r.cost,
        })),
        factoryWasteKg: sum(factoryWaste.data ?? [], (r) => r.quantity_kg),
      }
    },
  })
}
