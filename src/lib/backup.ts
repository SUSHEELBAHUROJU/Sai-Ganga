import { supabase } from './supabase'
import type { Database } from '../types/database'
import type { XlsxCell, XlsxSheet } from './xlsxWriter'

/**
 * The full backup: every table in the database, one sheet each.
 *
 * The same list, order and lookups are used by the automatic Google Drive
 * backup (backup/google-apps-script/SaiGangaBackup.gs) — keep them in step.
 */
type TableName = keyof Database['public']['Tables']
type Row = Record<string, unknown>

export type BackupTable = { table: TableName; sheet: string; order: string[] }

/** Business data first (what someone opening the file looks for), settings last. */
export const BACKUP_TABLES: BackupTable[] = [
  { table: 'bills', sheet: 'Bills', order: ['created_at', 'id'] },
  { table: 'sales_entries', sheet: 'Sales', order: ['created_at', 'id'] },
  { table: 'ledger_transactions', sheet: 'Customer Payments & Dues', order: ['created_at', 'id'] },
  { table: 'production_entries', sheet: 'Production', order: ['created_at', 'id'] },
  { table: 'recycling_entries', sheet: 'Recycling', order: ['created_at', 'id'] },
  { table: 'raw_material_purchases', sheet: 'Raw Material Purchases', order: ['created_at', 'id'] },
  { table: 'raw_material_purchase_returns', sheet: 'Purchase Returns', order: ['created_at', 'id'] },
  { table: 'scrap_purchases', sheet: 'Scrap Purchases', order: ['created_at', 'id'] },
  { table: 'factory_waste_entries', sheet: 'Factory Waste', order: ['created_at', 'id'] },
  { table: 'supplier_ledger_transactions', sheet: 'Supplier Payments & Dues', order: ['created_at', 'id'] },
  { table: 'expenses', sheet: 'Expenses', order: ['created_at', 'id'] },
  { table: 'stock_counts', sheet: 'Stock Counts', order: ['created_at', 'id'] },
  { table: 'stock_count_items', sheet: 'Stock Count Items', order: ['created_at', 'id'] },
  { table: 'stock_check_my_costs', sheet: 'My Costs', order: ['count_id'] },
  { table: 'stock_check_manual_rates', sheet: 'My Costs - Material Rates', order: ['count_id', 'raw_material_type_id'] },
  { table: 'customers', sheet: 'Customers', order: ['created_at', 'id'] },
  { table: 'raw_material_suppliers', sheet: 'Suppliers', order: ['created_at', 'id'] },
  { table: 'scrap_dealers', sheet: 'Scrap Dealers', order: ['created_at', 'id'] },
  { table: 'pipe_products', sheet: 'Pipe Sizes', order: ['created_at', 'id'] },
  { table: 'raw_material_types', sheet: 'Raw Material Types', order: ['created_at', 'id'] },
  { table: 'scrap_types', sheet: 'Scrap Types', order: ['created_at', 'id'] },
  { table: 'expense_categories', sheet: 'Expense Types', order: ['created_at', 'id'] },
  { table: 'opening_balances', sheet: 'Opening Stock', order: ['created_at', 'id'] },
  { table: 'low_stock_thresholds', sheet: 'Low Stock Alerts', order: ['created_at', 'id'] },
  { table: 'company_settings', sheet: 'Bill Settings', order: ['id'] },
]

const PAGE_SIZE = 1000

/** Every row of a table, paged past Supabase's 1000-row cap, in a stable order. */
async function fetchTable({ table, order }: BackupTable): Promise<Row[]> {
  const all: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select('*')
    for (const column of order) query = query.order(column, { ascending: true })
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const page = (data ?? []) as Row[]
    all.push(...page)
    if (page.length < PAGE_SIZE) return all
  }
}

export type BackupData = Record<string, Row[]>

/** Reads every table. `onProgress` gets the number of tables done so far. */
export async function fetchBackupData(onProgress?: (done: number, total: number) => void): Promise<BackupData> {
  const data: BackupData = {}
  let done = 0
  for (const t of BACKUP_TABLES) {
    data[t.table] = await fetchTable(t)
    onProgress?.(++done, BACKUP_TABLES.length)
  }
  return data
}

/* ---------------------------------------------------------------- lookups */

const byId = (rows: Row[] | undefined, label: (r: Row) => string) =>
  new Map((rows ?? []).map((r) => [String(r.id), label(r)]))

const nameOf = (r: Row) => String(r.name ?? '')
const pipeLabel = (r: Row) => `${r.diameter_inches}" x ${r.weight_kg}kg`

/**
 * Readable names for the id columns, so a sheet shows "Ravi Traders" and
 * "2\" x 1.5kg" instead of long codes. The ids stay too (for restoring).
 */
function buildLookups(data: BackupData) {
  const pipes = byId(data.pipe_products, pipeLabel)
  const materials = byId(data.raw_material_types, nameOf)
  const scrap = byId(data.scrap_types, nameOf)
  const purchases = byId(data.raw_material_purchases, (r) => `${r.entry_date} ${materials.get(String(r.raw_material_type_id)) ?? ''}`.trim())
  return {
    customer_id: { header: 'Customer', map: byId(data.customers, nameOf) },
    pipe_product_id: { header: 'Pipe Size', map: pipes },
    supplier_id: { header: 'Supplier', map: byId(data.raw_material_suppliers, nameOf) },
    scrap_dealer_id: { header: 'Scrap Dealer', map: byId(data.scrap_dealers, nameOf) },
    raw_material_type_id: { header: 'Material', map: materials },
    scrap_type_id: { header: 'Scrap Type', map: scrap },
    source_scrap_type_id: { header: 'Source Scrap', map: scrap },
    linked_scrap_type_id: { header: 'Linked Scrap', map: scrap },
    category_id: { header: 'Expense Type', map: byId(data.expense_categories, nameOf) },
    bill_id: { header: 'Bill No', map: byId(data.bills, (r) => String(r.bill_number ?? '')) },
    count_id: { header: 'Count Date', map: byId(data.stock_counts, (r) => String(r.count_date ?? '')) },
    purchase_id: { header: 'Purchase', map: purchases },
    // item_id is resolved by item_type below.
    item_id: { header: 'Item', map: new Map<string, string>([...pipes, ...materials, ...scrap]) },
  } as Record<string, { header: string; map: Map<string, string> }>
}

/** "entry_date" → "Entry Date". */
function headerOf(column: string): string {
  return column
    .split('_')
    .map((w) => (w === 'id' ? 'ID' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

function cellOf(value: unknown): XlsxCell {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'object') return JSON.stringify(value)
  // Numeric columns come back as numbers already; keep text as text.
  return String(value)
}

/**
 * The workbook: a "Read me" sheet (when, how many rows per table), then one
 * sheet per table — readable name columns first, then every column as stored.
 */
export function buildBackupSheets(data: BackupData, generatedAt: Date, businessName: string): XlsxSheet[] {
  const lookups = buildLookups(data)

  const tableSheets: XlsxSheet[] = BACKUP_TABLES.map(({ table, sheet }) => {
    const rows = data[table] ?? []
    const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
    const lookupCols = columns.filter((c) => lookups[c])
    const header = [...lookupCols.map((c) => lookups[c].header), ...columns.map(headerOf)]
    const body = rows.map((r) => [
      ...lookupCols.map((c) => (r[c] ? (lookups[c].map.get(String(r[c])) ?? '') : '')),
      ...columns.map((c) => cellOf(r[c])),
    ])
    return { name: sheet, rows: rows.length ? [header, ...body] : [['No entries yet']] }
  })

  const readMe: XlsxSheet = {
    name: 'Read me',
    rows: [
      ['Sai Ganga - Full Data Backup'],
      ['Business', businessName],
      ['Taken on', generatedAt.toLocaleString('en-IN')],
      ['Note', 'Every table of the app, one sheet each. Name columns (Customer, Pipe Size...) are added for reading.'],
      [],
      ['Sheet', 'Rows'],
      ...BACKUP_TABLES.map(({ table, sheet }) => [sheet, (data[table] ?? []).length]),
    ],
  }

  return [readMe, ...tableSheets]
}

/** "Sai_Ganga_Backup_2026-11-01" — same name pattern as the Drive backups. */
export function backupFileBase(date: Date): string {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return `Sai_Ganga_Backup_${d}`
}

/** Remembers that a backup was taken, so the app can remind when the next is due. */
export async function recordBackupTaken(by: 'app' | 'auto'): Promise<void> {
  const { error } = await supabase
    .from('company_settings')
    .update({ last_backup_at: new Date().toISOString(), last_backup_by: by })
    .eq('id', 'default')
  // Before the database update that adds these columns is run, this fails —
  // the backup itself has still been saved, so don't treat it as an error.
  if (error) console.warn('Could not record backup time:', error.message)
}

export { BACKUP_DUE_AFTER_DAYS } from './backupSchedule'
