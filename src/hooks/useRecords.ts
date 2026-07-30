import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'
import { formatQty, formatPipeProductLabel, piecesToKg } from '../lib/format'

type Tables = Database['public']['Tables']

type PipeRef = { diameter_inches: number; weight_kg: number } | null
type NameRef = { name: string } | null

export type ProductionRecordRow = Tables['production_entries']['Row'] & { pipe_products: PipeRef }
export type SaleRecordRow = Tables['sales_entries']['Row'] & {
  pipe_products: PipeRef
  customers: NameRef
}
export type RecyclingRecordRow = Tables['recycling_entries']['Row'] & {
  scrap_types: NameRef
  pipe_products: PipeRef
}
export type RawPurchaseRecordRow = Tables['raw_material_purchases']['Row'] & {
  raw_material_types: NameRef
}
export type ScrapPurchaseRecordRow = Tables['scrap_purchases']['Row'] & {
  scrap_dealers: NameRef
  scrap_types: NameRef
}
export type FactoryWasteRecordRow = Tables['factory_waste_entries']['Row'] & { scrap_types: NameRef }

export type RecordKind =
  | 'production'
  | 'sale'
  | 'recycling'
  | 'raw_material_purchase'
  | 'scrap_purchase'
  | 'factory_waste'

export type EntryRecord =
  | { kind: 'production'; row: ProductionRecordRow }
  | { kind: 'sale'; row: SaleRecordRow }
  | { kind: 'recycling'; row: RecyclingRecordRow }
  | { kind: 'raw_material_purchase'; row: RawPurchaseRecordRow }
  | { kind: 'scrap_purchase'; row: ScrapPurchaseRecordRow }
  | { kind: 'factory_waste'; row: FactoryWasteRecordRow }

export const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  production: 'Production',
  sale: 'Sale',
  recycling: 'Recycling',
  raw_material_purchase: 'Raw Material',
  scrap_purchase: 'Scrap Purchase',
  factory_waste: 'Factory Waste',
}

/**
 * Display fields for a record card — title, optional subtitle, and amount.
 * Production/sale amounts are kg-primary (with pcs riding along) since the
 * business measures those in weight, not piece count; everything else is
 * already a plain kg or bag-count string.
 */
export function describeRecord(record: EntryRecord): {
  title: string
  subtitle: string | null
  amount: string
  amountKgPcs: { kg: number; pcs: number } | null
} {
  switch (record.kind) {
    case 'production': {
      const p = record.row.pipe_products
      const kg = p ? piecesToKg(record.row.quantity, p.weight_kg) : 0
      return {
        title: p ? formatPipeProductLabel(p.diameter_inches, p.weight_kg) : 'Unknown product',
        subtitle: null,
        amount: `${formatQty(record.row.quantity)} pcs`,
        amountKgPcs: { kg, pcs: record.row.quantity },
      }
    }
    case 'sale': {
      const p = record.row.pipe_products
      const kg = p ? piecesToKg(record.row.quantity, p.weight_kg) : 0
      return {
        title: p ? formatPipeProductLabel(p.diameter_inches, p.weight_kg) : 'Unknown product',
        subtitle: record.row.customers?.name ?? 'No customer',
        amount: `${formatQty(record.row.quantity)} pcs`,
        amountKgPcs: { kg, pcs: record.row.quantity },
      }
    }
    case 'recycling': {
      const sourceName = record.row.scrap_types?.name ?? 'Unknown material'
      return {
        title:
          record.row.output_entry_mode === 'bag' && record.row.num_bags !== null
            ? `${formatQty(record.row.num_bags)} × ${formatQty(record.row.output_pack_kg ?? 0)}kg bags`
            : 'Granules produced',
        subtitle: `From ${sourceName}`,
        amount: `${formatQty(record.row.total_output_kg ?? 0)} kg`,
        amountKgPcs: null,
      }
    }
    case 'raw_material_purchase':
      return {
        title: record.row.raw_material_types?.name ?? 'Unknown material',
        subtitle: record.row.supplier_name,
        amount: `${formatQty(record.row.total_qty_kg)} kg`,
        amountKgPcs: null,
      }
    case 'scrap_purchase':
      return {
        title: record.row.scrap_types?.name ?? 'Unknown scrap type',
        subtitle: record.row.scrap_dealers?.name ?? 'No dealer',
        amount: `${formatQty(record.row.quantity_kg)} kg`,
        amountKgPcs: null,
      }
    case 'factory_waste':
      return {
        title: record.row.scrap_types?.name ?? 'Unknown scrap type',
        subtitle: 'Factory waste',
        amount: `${formatQty(record.row.quantity_kg)} kg`,
        amountKgPcs: null,
      }
  }
}

/** Plain-text amount for contexts that can't render JSX (e.g. a confirm dialog). */
export function describeRecordAmountText(record: EntryRecord): string {
  const { amount, amountKgPcs } = describeRecord(record)
  return amountKgPcs ? `${formatQty(amountKgPcs.kg)} kg (${formatQty(amountKgPcs.pcs)} pcs)` : amount
}

export type RecordsFilter = {
  fromDate: string
  toDate: string
  kinds: RecordKind[]
}

export function useRecords({ fromDate, toDate, kinds }: RecordsFilter) {
  return useQuery({
    queryKey: ['records', fromDate, toDate, [...kinds].sort()],
    queryFn: async (): Promise<EntryRecord[]> => {
      const wants = (kind: RecordKind) => kinds.length === 0 || kinds.includes(kind)
      const inRange = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
        q: T,
      ) => q.gte('entry_date', fromDate).lte('entry_date', toDate)

      const [production, sales, recycling, rawPurchases, scrapPurchases, factoryWaste] =
        await Promise.all([
          wants('production')
            ? inRange(
                supabase
                  .from('production_entries')
                  .select('*, pipe_products(diameter_inches, weight_kg)'),
              )
            : null,
          wants('sale')
            ? inRange(
                supabase
                  .from('sales_entries')
                  .select('*, pipe_products(diameter_inches, weight_kg), customers(name)'),
              )
            : null,
          wants('recycling')
            ? inRange(
                supabase
                  .from('recycling_entries')
                  .select('*, scrap_types(name), pipe_products(diameter_inches, weight_kg)'),
              )
            : null,
          wants('raw_material_purchase')
            ? inRange(supabase.from('raw_material_purchases').select('*, raw_material_types(name)'))
            : null,
          wants('scrap_purchase')
            ? inRange(
                supabase.from('scrap_purchases').select('*, scrap_dealers(name), scrap_types(name)'),
              )
            : null,
          wants('factory_waste')
            ? inRange(supabase.from('factory_waste_entries').select('*, scrap_types(name)'))
            : null,
        ])

      for (const result of [
        production,
        sales,
        recycling,
        rawPurchases,
        scrapPurchases,
        factoryWaste,
      ]) {
        if (result?.error) throw result.error
      }

      const records: EntryRecord[] = [
        ...((production?.data ?? []) as unknown as ProductionRecordRow[]).map(
          (row): EntryRecord => ({ kind: 'production', row }),
        ),
        ...((sales?.data ?? []) as unknown as SaleRecordRow[]).map(
          (row): EntryRecord => ({ kind: 'sale', row }),
        ),
        ...((recycling?.data ?? []) as unknown as RecyclingRecordRow[]).map(
          (row): EntryRecord => ({ kind: 'recycling', row }),
        ),
        ...((rawPurchases?.data ?? []) as unknown as RawPurchaseRecordRow[]).map(
          (row): EntryRecord => ({ kind: 'raw_material_purchase', row }),
        ),
        ...((scrapPurchases?.data ?? []) as unknown as ScrapPurchaseRecordRow[]).map(
          (row): EntryRecord => ({ kind: 'scrap_purchase', row }),
        ),
        ...((factoryWaste?.data ?? []) as unknown as FactoryWasteRecordRow[]).map(
          (row): EntryRecord => ({ kind: 'factory_waste', row }),
        ),
      ]

      // Most recent day first; within a day, most recently created first.
      return records.sort((a, b) => {
        if (a.row.entry_date !== b.row.entry_date) {
          return a.row.entry_date < b.row.entry_date ? 1 : -1
        }
        return a.row.created_at < b.row.created_at ? 1 : -1
      })
    },
  })
}

/** Records bucketed by entry_date, preserving the sorted order. */
export function groupRecordsByDate(records: EntryRecord[]): [string, EntryRecord[]][] {
  const groups = new Map<string, EntryRecord[]>()
  for (const record of records) {
    const existing = groups.get(record.row.entry_date)
    if (existing) existing.push(record)
    else groups.set(record.row.entry_date, [record])
  }
  return Array.from(groups.entries())
}
