import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { isoDateRange } from '../lib/date'
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

type PipeRef = { diameter_inches: number; weight_kg: number } | null
type DatedQtyRow = { entry_date: string; quantity: number; pipe_products: PipeRef }

export function useMonthlyReport(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['reports', 'monthly', fromDate, toDate],
    queryFn: async (): Promise<MonthlyReport> => {
      const inRange = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
        q: T,
      ) => q.gte('entry_date', fromDate).lte('entry_date', toDate)

      const [production, sales, recycling, rawPurchases, scrapPurchases, factoryWaste] =
        await Promise.all([
          inRange(
            supabase
              .from('production_entries')
              .select('entry_date, quantity, pipe_products(diameter_inches, weight_kg)'),
          ),
          inRange(
            supabase
              .from('sales_entries')
              .select('entry_date, quantity, pipe_products(diameter_inches, weight_kg)'),
          ),
          inRange(
            supabase
              .from('recycling_entries')
              .select('total_output_kg'),
          ),
          inRange(
            supabase
              .from('raw_material_purchases')
              .select('total_qty_kg, raw_material_types(name)'),
          ),
          inRange(supabase.from('scrap_purchases').select('quantity_kg')),
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

      const productionRows = (production.data ?? []) as unknown as DatedQtyRow[]
      const salesRows = (sales.data ?? []) as unknown as DatedQtyRow[]
      const rowKg = (row: DatedQtyRow) => piecesToKg(row.quantity, row.pipe_products?.weight_kg ?? 0)

      // Per-product produced vs sold, keyed on the display label so both sides
      // land in the same row even when only one has activity.
      const byProduct = new Map<string, ProductMonthTotal>()
      const upsert = (
        row: DatedQtyRow,
        pcsField: 'producedPcs' | 'soldPcs',
        kgField: 'producedKg' | 'soldKg',
      ) => {
        const p = row.pipe_products
        const label = p ? formatPipeProductLabel(p.diameter_inches, p.weight_kg) : 'Unknown product'
        const entry =
          byProduct.get(label) ?? { label, producedPcs: 0, producedKg: 0, soldPcs: 0, soldKg: 0 }
        entry[pcsField] += row.quantity
        entry[kgField] += rowKg(row)
        byProduct.set(label, entry)
      }
      for (const row of productionRows) upsert(row, 'producedPcs', 'producedKg')
      for (const row of salesRows) upsert(row, 'soldPcs', 'soldKg')

      // Daily series across every day of the selected range, zero-filled so
      // the trend line shows genuine gaps rather than skipping to the next
      // active day. In kg, like every other production/sales figure in the app.
      const rangeDates = isoDateRange(fromDate, toDate)
      const series: DayPoint[] = rangeDates.map((date, i) => ({
        day: i + 1,
        date,
        produced: 0,
        sold: 0,
      }))
      const dateToIndex = new Map(rangeDates.map((date, i) => [date, i]))
      for (const row of productionRows) {
        const i = dateToIndex.get(row.entry_date)
        if (i !== undefined) series[i].produced += rowKg(row)
      }
      for (const row of salesRows) {
        const i = dateToIndex.get(row.entry_date)
        if (i !== undefined) series[i].sold += rowKg(row)
      }

      const sum = <T>(rows: T[], pick: (r: T) => number) =>
        rows.reduce((total, r) => total + pick(r), 0)

      const recyclingRows = (recycling.data ?? []) as unknown as {
        total_output_kg: number | null
      }[]

      const rawRows = (rawPurchases.data ?? []) as unknown as {
        total_qty_kg: number
        raw_material_types: { name: string } | null
      }[]
      const rawByType = new Map<string, number>()
      for (const row of rawRows) {
        const label = row.raw_material_types?.name ?? 'Unknown material'
        rawByType.set(label, (rawByType.get(label) ?? 0) + row.total_qty_kg)
      }

      return {
        byProduct: Array.from(byProduct.values()).sort(
          (a, b) => b.producedKg + b.soldKg - (a.producedKg + a.soldKg),
        ),
        producedTotalPcs: sum(productionRows, (r) => r.quantity),
        producedTotalKg: sum(productionRows, rowKg),
        soldTotalPcs: sum(salesRows, (r) => r.quantity),
        soldTotalKg: sum(salesRows, rowKg),
        recyclingOutputKg: sum(recyclingRows, (r) => r.total_output_kg ?? 0),
        rawPurchasedKg: sum(rawRows, (r) => r.total_qty_kg),
        rawPurchasedByType: Array.from(rawByType.entries())
          .map(([label, quantity]) => ({ label, quantity }))
          .sort((a, b) => b.quantity - a.quantity),
        scrapPurchasedKg: sum(scrapPurchases.data ?? [], (r) => r.quantity_kg),
        factoryWasteKg: sum(factoryWaste.data ?? [], (r) => r.quantity_kg),
        series,
      }
    },
  })
}
