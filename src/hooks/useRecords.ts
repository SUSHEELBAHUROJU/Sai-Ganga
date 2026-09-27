import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database'
import { formatQty, formatPipeProductLabel, piecesToKg } from '../lib/format'

type Tables = Database['public']['Tables']

type PipeRef = { diameter_inches: number; weight_kg: number } | null
type NameRef = { name: string } | null
type CustomerRef = { name: string; phone: string | null; address: string | null } | null
type BillRef = { id: string; bill_number: string; status: 'active' | 'voided' } | null

export type ProductionRecordRow = Tables['production_entries']['Row'] & { pipe_products: PipeRef }
export type SaleRecordRow = Tables['sales_entries']['Row'] & {
  pipe_products: PipeRef
  customers: CustomerRef
  bills: BillRef
}
export type RecyclingRecordRow = Tables['recycling_entries']['Row'] & {
  scrap_types: NameRef
  pipe_products: PipeRef
}
export type RawPurchaseRecordRow = Tables['raw_material_purchases']['Row'] & {
  raw_material_types: NameRef
  raw_material_suppliers: NameRef
  raw_material_purchase_returns: { quantity_kg: number }[] | null
}
export type ScrapPurchaseRecordRow = Tables['scrap_purchases']['Row'] & {
  scrap_dealers: NameRef
  scrap_types: NameRef
}
export type FactoryWasteRecordRow = Tables['factory_waste_entries']['Row'] & { scrap_types: NameRef }
export type ExpenseRecordRow = Tables['expenses']['Row'] & { expense_categories: NameRef }

export type RecordKind =
  | 'production'
  | 'sale'
  | 'recycling'
  | 'raw_material_purchase'
  | 'scrap_purchase'
  | 'factory_waste'
  | 'expense'

export type EntryRecord =
  | { kind: 'production'; row: ProductionRecordRow }
  | { kind: 'sale'; row: SaleRecordRow }
  | { kind: 'recycling'; row: RecyclingRecordRow }
  | { kind: 'raw_material_purchase'; row: RawPurchaseRecordRow }
  | { kind: 'scrap_purchase'; row: ScrapPurchaseRecordRow }
  | { kind: 'factory_waste'; row: FactoryWasteRecordRow }
  | { kind: 'expense'; row: ExpenseRecordRow }

export const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  production: 'Production',
  sale: 'Sale',
  recycling: 'Recycling',
  raw_material_purchase: 'Raw Material',
  scrap_purchase: 'Scrap Purchase',
  factory_waste: 'Factory Waste',
  expense: 'Expense',
}

/** Kg of a raw-material purchase already sent back to the supplier. */
export function rawPurchaseReturnedKg(row: RawPurchaseRecordRow): number {
  return (row.raw_material_purchase_returns ?? []).reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0)
}

/** A raw-material purchase's supplier: the structured one, falling back to the
 *  free text recorded before suppliers became real entities. */
export function rawPurchaseSupplierName(row: RawPurchaseRecordRow): string | null {
  return row.raw_material_suppliers?.name ?? row.supplier_name ?? null
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
      const sourceName = record.row.scrap_types?.name ?? ''
      let granuleProduct = 'Recycled Granules'
      if (sourceName.toLowerCase().includes('ldpe') || sourceName.toLowerCase().includes('old ldpe')) {
        granuleProduct = 'Recycled LD Pipe Granules'
      } else if (sourceName.toLowerCase().includes('drip')) {
        granuleProduct = 'Recycled Drip Pipe Granules'
      }

      const bagInfo =
        record.row.output_entry_mode === 'bag' && record.row.num_bags !== null
          ? `${formatQty(record.row.num_bags)} × ${formatQty(record.row.output_pack_kg ?? 0)}kg bags`
          : null

      return {
        title: granuleProduct,
        subtitle: bagInfo ? `${bagInfo} • Source: ${sourceName || 'Scrap'}` : sourceName ? `Source: ${sourceName}` : null,
        amount: `${formatQty(record.row.total_output_kg ?? 0)} kg`,
        amountKgPcs: null,
      }
    }
    case 'raw_material_purchase':
      return {
        title: record.row.raw_material_types?.name ?? 'Unknown material',
        subtitle: rawPurchaseSupplierName(record.row),
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
    // Money out, not stock — the only kind whose amount is rupees.
    case 'expense':
      return {
        title: record.row.expense_categories?.name ?? 'Expense',
        subtitle: record.row.notes,
        amount: `₹${formatQty(record.row.amount)}`,
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

// PostgREST caps any unlimited select at max_rows (1000) and silently drops
// the rest — same risk documented in csvExport.ts. Records already bounds
// its range to MAX_QUERY_RANGE_DAYS, but a very active date range could
// still exceed this per table, so cap explicitly (ordered so the newest
// rows in range survive) and surface it rather than truncating silently.
const ROW_CAP = 1000

export type RecordsResult = { records: EntryRecord[]; truncated: boolean }

export function useRecords({ fromDate, toDate, kinds }: RecordsFilter) {
  return useQuery({
    queryKey: ['records', fromDate, toDate, [...kinds].sort()],
    queryFn: async (): Promise<RecordsResult> => {
      const wants = (kind: RecordKind) => kinds.length === 0 || kinds.includes(kind)
      const inRange = <
        T extends {
          gte: (c: string, v: string) => T
          lte: (c: string, v: string) => T
          order: (c: string, opts: { ascending: boolean }) => T
          limit: (n: number) => T
        },
      >(
        q: T,
      ) =>
        q
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .order('entry_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(ROW_CAP)

      const [production, sales, recycling, rawPurchases, scrapPurchases, factoryWaste, expenses] =
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
                  .select('*, pipe_products(diameter_inches, weight_kg), customers(name, phone, address), bills(id, bill_number, status)'),
              )
            : null,
          wants('recycling')
            ? inRange(
                supabase
                  .from('recycling_entries')
                  .select('*, scrap_types:source_scrap_type_id(name), pipe_products(diameter_inches, weight_kg)'),
              )
            : null,
          wants('raw_material_purchase')
            ? inRange(
                supabase
                  .from('raw_material_purchases')
                  .select(
                    '*, raw_material_types(name), raw_material_suppliers(name), raw_material_purchase_returns(quantity_kg)',
                  ),
              )
            : null,
          wants('scrap_purchase')
            ? inRange(
                supabase.from('scrap_purchases').select('*, scrap_dealers(name), scrap_types(name)'),
              )
            : null,
          wants('factory_waste')
            ? inRange(supabase.from('factory_waste_entries').select('*, scrap_types(name)'))
            : null,
          wants('expense')
            ? inRange(supabase.from('expenses').select('*, expense_categories(name)'))
            : null,
        ])

      for (const result of [
        production,
        sales,
        recycling,
        rawPurchases,
        scrapPurchases,
        factoryWaste,
        expenses,
      ]) {
        if (result?.error) throw result.error
      }

      const truncated = [
        production,
        sales,
        recycling,
        rawPurchases,
        scrapPurchases,
        factoryWaste,
        expenses,
      ].some((result) => (result?.data?.length ?? 0) >= ROW_CAP)

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
        ...((expenses?.data ?? []) as unknown as ExpenseRecordRow[]).map(
          (row): EntryRecord => ({ kind: 'expense', row }),
        ),
      ]

      // Most recent day first; within a day, most recently created first.
      records.sort((a, b) => {
        if (a.row.entry_date !== b.row.entry_date) {
          return a.row.entry_date < b.row.entry_date ? 1 : -1
        }
        return a.row.created_at < b.row.created_at ? 1 : -1
      })

      return { records, truncated }
    },
  })
}

export type RecordsReportEntry = {
  type: 'entry'
  kind: RecordKind
  kindLabel: string
  details: string
  qty: string
  /** Rupees — only expenses carry money on this generic report. */
  amount: number | null
}

/** A weight total closing a run of rows: a bill's sales, or a day's output. */
export type RecordsReportSubtotal = {
  type: 'subtotal'
  label: string
  qty: string
}

export type RecordsReportLine = RecordsReportEntry | RecordsReportSubtotal

/** One day's rows, the unit the printed report is organised around. */
export type RecordsReportDay = {
  entry_date: string
  lines: RecordsReportLine[]
  /** Entries only — subtotal rows don't count towards the day's tally. */
  entryCount: number
  /** Money spent that day, for the day header — 0 when nothing was spent. */
  amount: number
}

export type RecordsReportSummaryRow = {
  label: string
  qty: string | null
  amount: number | null
}

export type RecordsReportData = {
  days: RecordsReportDay[]
  summary: RecordsReportSummaryRow[]
  totalEntries: number
}

/** "385 kg (23 pcs)", or plain kg when nothing is counted in pieces. */
function kgPcsText(kg: number, pcs: number): string {
  return pcs > 0 ? `${formatQty(kg)} kg (${formatQty(pcs)} pcs)` : `${formatQty(kg)} kg`
}

/** The bill a sale was invoiced on, or null while it is still unbilled. */
function saleBillNumber(row: SaleRecordRow): string | null {
  const raw = row.bills as unknown
  const bill = Array.isArray(raw) ? (raw[0] as BillRef) : (raw as BillRef)
  return bill?.bill_number ?? null
}

/**
 * Turns whatever the Records page currently has loaded into a printable
 * report, grouped by day the way the on-screen list is — a day heading, then
 * that day's rows — and running oldest first, since a printed report reads
 * top-to-bottom chronologically while the screen shows newest first.
 * Built straight from the same `records` the page already fetched, so the
 * PDF always matches what's on screen with no second round trip.
 *
 * Within a day, rows are clustered by kind (and sales further by bill) rather
 * than left in entry order, so the weight totals below each bill and below the
 * day's production have something contiguous to close off.
 */
export function buildRecordsReport(records: EntryRecord[]): RecordsReportData {
  const kindOrder = Object.keys(RECORD_KIND_LABEL) as RecordKind[]
  const rank = (kind: RecordKind) => kindOrder.indexOf(kind)

  const byDate = new Map<string, EntryRecord[]>()
  for (const record of records) {
    const bucket = byDate.get(record.row.entry_date)
    if (bucket) bucket.push(record)
    else byDate.set(record.row.entry_date, [record])
  }

  const toEntry = (record: EntryRecord): RecordsReportEntry => {
    const { title, subtitle, amount, amountKgPcs } = describeRecord(record)
    const isExpense = record.kind === 'expense'
    return {
      type: 'entry',
      kind: record.kind,
      kindLabel: RECORD_KIND_LABEL[record.kind],
      details: subtitle ? `${title} — ${subtitle}` : title,
      qty: isExpense ? '' : amountKgPcs ? kgPcsText(amountKgPcs.kg, amountKgPcs.pcs) : amount,
      amount: isExpense ? Number(record.row.amount) || 0 : null,
    }
  }

  /** Weight of one pipe-product row, the only kind measured in pieces. */
  const pipeWeight = (record: EntryRecord) => {
    if (record.kind !== 'production' && record.kind !== 'sale') return { kg: 0, pcs: 0 }
    const p = record.row.pipe_products
    return { kg: p ? piecesToKg(record.row.quantity, p.weight_kg) : 0, pcs: record.row.quantity }
  }

  const days: RecordsReportDay[] = [...byDate.keys()]
    .sort()
    .map((entry_date) => {
      const dayRecords = [...byDate.get(entry_date)!].sort((a, b) => {
        if (a.kind !== b.kind) return rank(a.kind) - rank(b.kind)
        if (a.kind === 'sale' && b.kind === 'sale') {
          // Keep a bill's lines together so its total sits directly beneath
          // them, with anything not yet billed collected at the end.
          const billA = saleBillNumber(a.row as SaleRecordRow)
          const billB = saleBillNumber(b.row as SaleRecordRow)
          if (billA !== billB) {
            if (billA === null) return 1
            if (billB === null) return -1
            return billA < billB ? -1 : 1
          }
        }
        return a.row.created_at < b.row.created_at ? -1 : 1
      })

      const lines: RecordsReportLine[] = []
      let amount = 0

      for (let i = 0; i < dayRecords.length; i++) {
        const record = dayRecords[i]
        lines.push(toEntry(record))
        amount += record.kind === 'expense' ? Number(record.row.amount) || 0 : 0

        if (record.kind !== 'production' && record.kind !== 'sale') continue

        // Close the run once the next row belongs to a different group.
        const next = dayRecords[i + 1]
        const sameGroup =
          next?.kind === record.kind &&
          (record.kind !== 'sale' ||
            saleBillNumber(next.row as SaleRecordRow) ===
              saleBillNumber(record.row as SaleRecordRow))
        if (sameGroup) continue

        let kg = 0
        let pcs = 0
        let start = i
        while (start >= 0) {
          const candidate = dayRecords[start]
          const inRun =
            candidate.kind === record.kind &&
            (record.kind !== 'sale' ||
              saleBillNumber(candidate.row as SaleRecordRow) ===
                saleBillNumber(record.row as SaleRecordRow))
          if (!inRun) break
          const w = pipeWeight(candidate)
          kg += w.kg
          pcs += w.pcs
          start--
        }

        const billNumber =
          record.kind === 'sale' ? saleBillNumber(record.row as SaleRecordRow) : null
        lines.push({
          type: 'subtotal',
          label:
            record.kind === 'production'
              ? "Day's production total"
              : billNumber
                ? `Bill ${billNumber} — total`
                : 'Sales not yet billed — total',
          qty: kgPcsText(kg, pcs),
        })
      }

      return { entry_date, lines, entryCount: dayRecords.length, amount }
    })

  type Bucket = { kg: number; pcs: number; amount: number; count: number }
  const byKind = new Map<RecordKind, Bucket>()
  for (const record of records) {
    const bucket = byKind.get(record.kind) ?? { kg: 0, pcs: 0, amount: 0, count: 0 }
    bucket.count += 1
    if (record.kind === 'production' || record.kind === 'sale') {
      const p = record.row.pipe_products
      bucket.kg += p ? piecesToKg(record.row.quantity, p.weight_kg) : 0
      bucket.pcs += record.row.quantity
    } else if (record.kind === 'recycling') {
      bucket.kg += record.row.total_output_kg ?? 0
    } else if (record.kind === 'raw_material_purchase') {
      bucket.kg += record.row.total_qty_kg ?? 0
    } else if (record.kind === 'scrap_purchase' || record.kind === 'factory_waste') {
      bucket.kg += record.row.quantity_kg ?? 0
    } else if (record.kind === 'expense') {
      bucket.amount += Number(record.row.amount) || 0
    }
    byKind.set(record.kind, bucket)
  }

  const summary: RecordsReportSummaryRow[] = (Object.keys(RECORD_KIND_LABEL) as RecordKind[])
    .filter((kind) => byKind.has(kind))
    .map((kind) => {
      const b = byKind.get(kind)!
      const isExpense = kind === 'expense'
      const qty = isExpense
        ? null
        : b.pcs > 0
          ? `${formatQty(b.kg)} kg (${formatQty(b.pcs)} pcs)`
          : `${formatQty(b.kg)} kg`
      return {
        label: `${RECORD_KIND_LABEL[kind]} (${b.count})`,
        qty,
        amount: isExpense ? b.amount : null,
      }
    })

  return { days, summary, totalEntries: records.length }
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

export type GroupedTransaction = {
  id: string
  kind: RecordKind
  date: string
  title: string
  subtitle: string | null
  totalKg: number
  totalPcs: number
  /** Rupee total — set only for money-denominated kinds (expenses), where a
   *  kg figure would be meaningless. */
  totalAmount: number | null
  bill: BillRef | null
  items: EntryRecord[]
}

/** Groups entries into multi-item transactions (Sales, Production runs, Purchases) per date */
export function groupRecordsByTransaction(records: EntryRecord[]): [string, GroupedTransaction[]][] {
  const dateMap = new Map<string, GroupedTransaction[]>()

  for (const record of records) {
    const date = record.row.entry_date
    if (!dateMap.has(date)) {
      dateMap.set(date, [])
    }
    const dayGroups = dateMap.get(date)!

    // Determine group key for transaction
    let key = ''
    if (record.kind === 'sale') {
      const s = record.row as SaleRecordRow
      if (s.bill_id) {
        key = `sale_bill_${s.bill_id}`
      } else {
        const custKey = s.customer_id || s.customers?.name || 'cash'
        const timeBatch = Math.floor(new Date(s.created_at).getTime() / (5 * 60 * 1000))
        key = `sale_${custKey}_${timeBatch}`
      }
    } else if (record.kind === 'production') {
      const timeBatch = Math.floor(new Date(record.row.created_at).getTime() / (5 * 60 * 1000))
      key = `prod_${timeBatch}`
    } else if (record.kind === 'raw_material_purchase') {
      const supplier =
        record.row.supplier_id || rawPurchaseSupplierName(record.row) || 'unknown'
      const timeBatch = Math.floor(new Date(record.row.created_at).getTime() / (5 * 60 * 1000))
      key = `raw_${supplier}_${timeBatch}`
    } else if (record.kind === 'scrap_purchase') {
      const dealer = record.row.scrap_dealer_id || record.row.scrap_dealers?.name || 'unknown'
      const timeBatch = Math.floor(new Date(record.row.created_at).getTime() / (5 * 60 * 1000))
      key = `scrap_${dealer}_${timeBatch}`
    } else {
      key = `${record.kind}_${record.row.id}`
    }

    let existingGroup = dayGroups.find((g) => g.id === key)
    if (!existingGroup) {
      let title = ''
      let subtitle: string | null = null
      let bill: BillRef | null = null

      if (record.kind === 'sale') {
        const s = record.row as SaleRecordRow
        title = s.customers?.name || 'Cash Sale'
        const rawBill = s.bills as any
        bill = Array.isArray(rawBill) ? rawBill[0] ?? null : rawBill ?? null
      } else if (record.kind === 'production') {
        title = 'Pipe Production'
      } else if (record.kind === 'raw_material_purchase') {
        title = 'Raw Material Purchase'
        const supplierName = rawPurchaseSupplierName(record.row)
        subtitle = supplierName ? `Supplier: ${supplierName}` : null
      } else if (record.kind === 'expense') {
        title = record.row.expense_categories?.name ?? 'Expense'
      } else if (record.kind === 'scrap_purchase') {
        title = 'Scrap Purchase'
        subtitle = record.row.scrap_dealers?.name ? `Dealer: ${record.row.scrap_dealers.name}` : null
      } else if (record.kind === 'recycling') {
        const sourceName = record.row.scrap_types?.name ?? ''
        if (sourceName.toLowerCase().includes('ldpe') || sourceName.toLowerCase().includes('old ldpe')) {
          title = 'Recycled LD Pipe'
        } else if (sourceName.toLowerCase().includes('drip')) {
          title = 'Recycled Drip Pipe'
        } else {
          title = sourceName ? `Recycled Granules (${sourceName})` : 'Recycling Production'
        }
        subtitle = sourceName ? `Source: ${sourceName}` : null
      } else {
        title = 'Factory Waste'
      }

      existingGroup = {
        id: key,
        kind: record.kind,
        date,
        title,
        subtitle,
        totalKg: 0,
        totalPcs: 0,
        totalAmount: record.kind === 'expense' ? 0 : null,
        bill,
        items: [],
      }
      dayGroups.push(existingGroup)
    }

    existingGroup.items.push(record)

    // Accumulate total weight and pcs
    if (record.kind === 'production' || record.kind === 'sale') {
      const p = record.row.pipe_products
      const kg = p ? piecesToKg(record.row.quantity, p.weight_kg) : 0
      existingGroup.totalKg += kg
      existingGroup.totalPcs += record.row.quantity
    } else if (record.kind === 'recycling') {
      existingGroup.totalKg += record.row.total_output_kg ?? 0
    } else if (record.kind === 'raw_material_purchase') {
      existingGroup.totalKg += record.row.total_qty_kg ?? 0
    } else if (record.kind === 'scrap_purchase' || record.kind === 'factory_waste') {
      existingGroup.totalKg += record.row.quantity_kg ?? 0
    } else if (record.kind === 'expense') {
      existingGroup.totalAmount = (existingGroup.totalAmount ?? 0) + (record.row.amount ?? 0)
    }
  }

  return Array.from(dateMap.entries())
}

