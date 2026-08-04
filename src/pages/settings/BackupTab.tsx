import { useState } from 'react'
import { Download, DatabaseBackup } from 'lucide-react'
import { fetchAllRows, rowsToCsv, downloadCsv } from '../../lib/csvExport'
import type { Database } from '../../types/database'
import { todayISODate } from '../../lib/date'
import { useToast } from '../../lib/toast'

type ExportDef = {
  key: string
  label: string
  description: string
  table: keyof Database['public']['Tables']
  select: string
  columns: string[]
  flatten: (row: Record<string, unknown>) => Record<string, unknown>
}

function nested(row: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = row[key]
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

const EXPORTS: ExportDef[] = [
  {
    key: 'production',
    label: 'Production Entries',
    description: 'Every pipe production entry ever logged',
    table: 'production_entries',
    select: '*, pipe_products(diameter_inches, weight_kg)',
    columns: ['entry_date', 'diameter_inches', 'weight_kg', 'quantity_pcs', 'notes', 'created_at'],
    flatten: (row) => {
      const p = nested(row, 'pipe_products')
      return {
        entry_date: row.entry_date,
        diameter_inches: p?.diameter_inches ?? '',
        weight_kg: p?.weight_kg ?? '',
        quantity_pcs: row.quantity,
        notes: row.notes,
        created_at: row.created_at,
      }
    },
  },
  {
    key: 'sales',
    label: 'Sales Entries',
    description: 'Every sale ever logged, with customer',
    table: 'sales_entries',
    select: '*, pipe_products(diameter_inches, weight_kg), customers(name)',
    columns: [
      'entry_date',
      'customer',
      'diameter_inches',
      'weight_kg',
      'quantity_pcs',
      'notes',
      'created_at',
    ],
    flatten: (row) => {
      const p = nested(row, 'pipe_products')
      const c = nested(row, 'customers')
      return {
        entry_date: row.entry_date,
        customer: c?.name ?? '',
        diameter_inches: p?.diameter_inches ?? '',
        weight_kg: p?.weight_kg ?? '',
        quantity_pcs: row.quantity,
        notes: row.notes,
        created_at: row.created_at,
      }
    },
  },
  {
    key: 'recycling',
    label: 'Recycling Entries',
    description: 'Granules produced from recycling',
    table: 'recycling_entries',
    select: '*, scrap_types(name)',
    columns: [
      'entry_date',
      'source_material',
      'granules_output_kg',
      'notes',
      'created_at',
    ],
    flatten: (row) => {
      const s = nested(row, 'scrap_types')
      return {
        entry_date: row.entry_date,
        source_material: s?.name ?? '',
        granules_output_kg: row.total_output_kg ?? '',
        notes: row.notes,
        created_at: row.created_at,
      }
    },
  },
  {
    key: 'raw_material_purchases',
    label: 'Raw Material Purchases',
    description: 'Virgin/recycled granule purchases',
    table: 'raw_material_purchases',
    select: '*, raw_material_types(name)',
    columns: ['entry_date', 'material', 'supplier_name', 'total_qty_kg', 'cost', 'notes', 'created_at'],
    flatten: (row) => {
      const t = nested(row, 'raw_material_types')
      return {
        entry_date: row.entry_date,
        material: t?.name ?? '',
        supplier_name: row.supplier_name ?? '',
        total_qty_kg: row.total_qty_kg,
        cost: row.cost ?? '',
        notes: row.notes,
        created_at: row.created_at,
      }
    },
  },
  {
    key: 'scrap_purchases',
    label: 'Scrap Purchases',
    description: 'Scrap bought from dealers',
    table: 'scrap_purchases',
    select: '*, scrap_types(name), scrap_dealers(name)',
    columns: ['entry_date', 'scrap_type', 'dealer', 'quantity_kg', 'cost', 'notes', 'created_at'],
    flatten: (row) => {
      const t = nested(row, 'scrap_types')
      const d = nested(row, 'scrap_dealers')
      return {
        entry_date: row.entry_date,
        scrap_type: t?.name ?? '',
        dealer: d?.name ?? '',
        quantity_kg: row.quantity_kg,
        cost: row.cost ?? '',
        notes: row.notes,
        created_at: row.created_at,
      }
    },
  },
  {
    key: 'factory_waste',
    label: 'Factory Waste',
    description: 'In-house scrap waste logged',
    table: 'factory_waste_entries',
    select: '*, scrap_types(name)',
    columns: ['entry_date', 'scrap_type', 'quantity_kg', 'notes', 'created_at'],
    flatten: (row) => {
      const t = nested(row, 'scrap_types')
      return {
        entry_date: row.entry_date,
        scrap_type: t?.name ?? '',
        quantity_kg: row.quantity_kg,
        notes: row.notes,
        created_at: row.created_at,
      }
    },
  },
  {
    key: 'pipe_sizes',
    label: 'Pipe Sizes',
    description: 'Every pipe size, active or removed',
    table: 'pipe_products',
    select: '*',
    columns: ['diameter_inches', 'weight_kg', 'is_active', 'created_at'],
    flatten: (row) => row,
  },
  {
    key: 'raw_material_types',
    label: 'Raw Material Types',
    description: 'Virgin/recycled granule types',
    table: 'raw_material_types',
    select: '*',
    columns: ['name', 'default_pack_kg', 'is_active', 'created_at'],
    flatten: (row) => row,
  },
  {
    key: 'scrap_types',
    label: 'Scrap Types',
    description: 'Scrap material types',
    table: 'scrap_types',
    select: '*',
    columns: ['name', 'is_active', 'created_at'],
    flatten: (row) => row,
  },
  {
    key: 'customers',
    label: 'Customers',
    description: 'Everyone pipes have been sold to',
    table: 'customers',
    select: '*',
    columns: ['name', 'phone', 'address', 'is_active', 'created_at'],
    flatten: (row) => row,
  },
  {
    key: 'scrap_dealers',
    label: 'Scrap Dealers',
    description: 'Everyone scrap has been bought from',
    table: 'scrap_dealers',
    select: '*',
    columns: ['name', 'phone', 'address', 'is_active', 'created_at'],
    flatten: (row) => row,
  },
]

export function BackupTab() {
  const [exporting, setExporting] = useState<string | null>(null)
  const { showToast } = useToast()

  async function handleExport(def: ExportDef) {
    setExporting(def.key)
    try {
      const rows = await fetchAllRows(def.table, def.select)
      const flattened = rows.map(def.flatten)
      const csv = rowsToCsv(def.columns, flattened)
      downloadCsv(`${def.key}_${todayISODate()}.csv`, csv)
      showToast(`${def.label} exported (${rows.length} row${rows.length === 1 ? '' : 's'})`)
    } catch {
      showToast(`Could not export ${def.label}`, 'error')
    } finally {
      setExporting(null)
    }
  }

  // Sequential, not parallel — triggering several downloads at once is
  // exactly the pattern browsers throttle/block as a popup-spam heuristic.
  async function handleExportAll() {
    for (const def of EXPORTS) {
      await handleExport(def)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <span className="shrink-0 rounded-full bg-teal-50 p-2.5 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
          <DatabaseBackup className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 dark:text-slate-100">Back up your records</p>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Download every entry as a spreadsheet (CSV) file you can open in Excel or Google Sheets.
            Do this regularly — it's the only copy of your data that lives outside this app.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleExportAll}
        disabled={exporting !== null}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
      >
        <Download className="h-4 w-4" />
        {exporting ? 'Exporting…' : 'Export Everything'}
      </button>

      <ul className="space-y-2">
        {EXPORTS.map((def) => (
          <li
            key={def.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-900 dark:text-slate-100">{def.label}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{def.description}</p>
            </div>
            <button
              type="button"
              onClick={() => handleExport(def)}
              disabled={exporting !== null}
              aria-label={`Export ${def.label}`}
              className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting === def.key ? 'Exporting…' : 'CSV'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
