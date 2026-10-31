import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { EntryMode } from './useRawMaterialPurchases'

export type StockCountItem = {
  raw_material_type_id: string
  entry_mode: EntryMode
  pack_kg: number | null
  num_bags: number | null
  quantity_kg: number
}

export type StockCount = {
  id: string
  count_date: string
  notes: string | null
  items: StockCountItem[]
}

/** One material's line in a count period — consumption priced at the latest rate, computed in Postgres. */
export type StockCheckMaterialRow = {
  count_id: string
  prev_count_date: string
  count_date: string
  /** Count this material's opening came from — older than prev_count_date
   *  when the material was left out of the previous count. */
  opening_count_date: string
  raw_material_type_id: string
  material_name: string
  is_recycled_output: boolean
  opening_kg: number
  purchased_kg: number
  returned_kg: number
  recycled_kg: number
  closing_kg: number
  consumed_kg: number
  consumed_cost: number
  /** Consumed kg with no purchase lot behind it — entries are probably missing. */
  unpriced_kg: number
  produced_kg: number
  factory_waste_kg: number
}

export type StockCheckProductionRow = {
  count_id: string
  pipe_product_id: string
  diameter_inches: number
  weight_kg: number
  pcs: number
  kg: number
}

/** One expense type's share of a count period — salaries, rent, electricity. */
export type StockCheckOverheadRow = {
  count_id: string
  category_id: string
  category_name: string
  is_salary: boolean
  amount: number
  /** Meter units' share (electricity); null for types that don't record units. */
  units: number | null
}

/** A count period (previous count → this count) with its materials and pipes. */
export type StockCheckPeriod = {
  count_id: string
  prev_count_date: string
  count_date: string
  materials: StockCheckMaterialRow[]
  production: StockCheckProductionRow[]
  /** Running costs of the period, largest first — only types counted in production cost. */
  overheads: StockCheckOverheadRow[]
  overhead_cost: number
  /** Meter units in the period, when any type records them. */
  units: number | null
  consumed_kg: number
  consumed_cost: number
  produced_kg: number
  produced_pcs: number
  factory_waste_kg: number
  /** consumed − produced. */
  waste_kg: number
  unpriced_kg: number
  /** Recycled material (granules) used in the period — the kg recycling pay and electricity are on. */
  recycled_used_kg: number
}

const COUNTS_KEY = ['stock_counts']
const REPORT_KEY = ['stock_check_report']

/** Counts and returns both change consumption and live stock. */
export function invalidateStockCheck(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: COUNTS_KEY })
  queryClient.invalidateQueries({ queryKey: REPORT_KEY })
  queryClient.invalidateQueries({ queryKey: MY_COSTS_KEY })
  queryClient.invalidateQueries({ queryKey: ['raw_material_stock'] })
  queryClient.invalidateQueries({ queryKey: ['dashboard'] })
}

/** Every count, newest first, with its items. */
export function useStockCounts() {
  return useQuery({
    queryKey: COUNTS_KEY,
    queryFn: async (): Promise<StockCount[]> => {
      const { data, error } = await supabase
        .from('stock_counts')
        .select('id, count_date, notes, items:stock_count_items(raw_material_type_id, entry_mode, pack_kg, num_bags, quantity_kg)')
        .order('count_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as StockCount[]
    },
  })
}

/** Most each material could have at the end of `date` if none was used — last
 *  count + everything received since — keyed by material id. */
export function useExpectedRawMaterialStock(date: string) {
  return useQuery({
    queryKey: [...COUNTS_KEY, 'expected', date],
    // Moves with every purchase, return and recycling entry, none of which
    // invalidate this key — always re-read when the count screen opens.
    staleTime: 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase.rpc('rpc_expected_raw_material_stock', { p_date: date })
      if (error) throw error
      return new Map((data ?? []).map((row) => [row.raw_material_type_id, Number(row.expected_kg) || 0]))
    },
  })
}

export function useSaveStockCount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { count_date: string; notes: string | null; items: StockCountItem[] }) => {
      const { error } = await supabase.rpc('save_stock_count', {
        p_date: input.count_date,
        p_notes: input.notes ?? '',
        p_items: input.items,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateStockCheck(queryClient),
  })
}

export function useDeleteStockCount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stock_counts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateStockCheck(queryClient),
  })
}

/** Count periods ending between `fromDate` and `toDate`, newest first. */
export function useStockCheckReport(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: [...REPORT_KEY, fromDate, toDate],
    // Same as above: production and purchases change it without invalidating it.
    staleTime: 0,
    queryFn: async (): Promise<StockCheckPeriod[]> => {
      const [materialsRes, productionRes, overheadsRes] = await Promise.all([
        supabase.rpc('rpc_stock_check_report', { p_from: fromDate, p_to: toDate }),
        supabase.rpc('rpc_stock_check_production', { p_from: fromDate, p_to: toDate }),
        supabase.rpc('rpc_stock_check_overheads', { p_from: fromDate, p_to: toDate }),
      ])
      if (materialsRes.error) throw materialsRes.error
      if (productionRes.error) throw productionRes.error
      if (overheadsRes.error) throw overheadsRes.error
      return buildPeriods(
        (materialsRes.data ?? []) as StockCheckMaterialRow[],
        (productionRes.data ?? []) as StockCheckProductionRow[],
        (overheadsRes.data ?? []) as StockCheckOverheadRow[],
      )
    },
  })
}

function buildPeriods(
  materialRows: StockCheckMaterialRow[],
  productionRows: StockCheckProductionRow[],
  overheadRows: StockCheckOverheadRow[],
): StockCheckPeriod[] {
  const byCount = new Map<string, StockCheckPeriod>()

  for (const row of materialRows) {
    let period = byCount.get(row.count_id)
    if (!period) {
      period = {
        count_id: row.count_id,
        prev_count_date: row.prev_count_date,
        count_date: row.count_date,
        materials: [],
        production: productionRows.filter((p) => p.count_id === row.count_id),
        overheads: overheadRows.filter((o) => o.count_id === row.count_id),
        overhead_cost: 0,
        units: null,
        consumed_kg: 0,
        consumed_cost: 0,
        // Production and factory waste are per period, repeated on every material row.
        produced_kg: Number(row.produced_kg) || 0,
        produced_pcs: 0,
        factory_waste_kg: Number(row.factory_waste_kg) || 0,
        waste_kg: 0,
        unpriced_kg: 0,
        recycled_used_kg: 0,
      }
      period.produced_pcs = period.production.reduce((sum, p) => sum + (Number(p.pcs) || 0), 0)
      period.overhead_cost = period.overheads.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
      const unitRows = period.overheads.filter((o) => o.units != null)
      period.units = unitRows.length ? unitRows.reduce((sum, o) => sum + Number(o.units), 0) : null
      byCount.set(row.count_id, period)
    }
    period.materials.push(row)
    period.consumed_kg += Number(row.consumed_kg) || 0
    period.consumed_cost += Number(row.consumed_cost) || 0
    period.unpriced_kg += Number(row.unpriced_kg) || 0
    if (row.is_recycled_output && row.consumed_kg > 0) period.recycled_used_kg += Number(row.consumed_kg)
  }

  const periods = [...byCount.values()]
  for (const period of periods) {
    period.waste_kg = period.consumed_kg - period.produced_kg
    // Heaviest-used material first — "which material did we use most this week".
    period.materials.sort((a, b) => b.consumed_kg - a.consumed_kg)
  }
  return periods.sort((a, b) => b.count_date.localeCompare(a.count_date))
}

/** Material cost per kg of pipe produced; null when nothing was produced. */
export function materialCostPerKg(period: StockCheckPeriod): number | null {
  return period.produced_kg > 0 ? period.consumed_cost / period.produced_kg : null
}

/** Running costs (salaries, rent, electricity…) per kg of pipe produced. */
export function runningCostPerKg(period: StockCheckPeriod): number | null {
  return period.produced_kg > 0 ? period.overhead_cost / period.produced_kg : null
}

/** Everything it cost to make 1 kg of pipe: material + running costs. */
export function costPerKgProduced(period: StockCheckPeriod): number | null {
  return period.produced_kg > 0 ? (period.consumed_cost + period.overhead_cost) / period.produced_kg : null
}

/** Share of consumed material that became pipe; null when nothing was consumed. */
export function yieldPercent(period: StockCheckPeriod): number | null {
  return period.consumed_kg > 0 ? (period.produced_kg / period.consumed_kg) * 100 : null
}

/** Prices the user typed in for one week, keyed by material id. */
export type ManualRates = Map<string, number>

export type MyCostExtra = { name: string; amount: number }

/** The owner's own costing of one week — see 20261013010000_stock_check_my_costs.sql. */
export type MyCosts = {
  rates: ManualRates
  operatorPipeRate: number
  operatorRecycledRate: number
  electricityPipeRate: number
  electricityRecycledRate: number
  extras: MyCostExtra[]
  includeAppExpenses: boolean
}

/** Operator pay per kg a week starts with when none has been saved yet. */
export const DEFAULT_OPERATOR_PIPE_RATE = 2.5
export const DEFAULT_OPERATOR_RECYCLED_RATE = 2.6

type SavedMyCosts = MyCosts & { updatedAt: string }

const MY_COSTS_KEY = ['stock_check_my_costs']

/** Every week's saved costs, keyed by count id. */
export function useAllMyCosts() {
  return useQuery({
    queryKey: MY_COSTS_KEY,
    queryFn: async (): Promise<Map<string, SavedMyCosts>> => {
      const [costsRes, ratesRes] = await Promise.all([
        supabase.from('stock_check_my_costs').select('*'),
        supabase.from('stock_check_manual_rates').select('count_id, raw_material_type_id, rate_per_kg'),
      ])
      if (costsRes.error) throw costsRes.error
      if (ratesRes.error) throw ratesRes.error

      const byCount = new Map<string, SavedMyCosts>()
      for (const row of costsRes.data ?? []) {
        byCount.set(row.count_id, {
          rates: new Map(),
          operatorPipeRate: Number(row.operator_pipe_rate) || 0,
          operatorRecycledRate: Number(row.operator_recycled_rate) || 0,
          electricityPipeRate: Number(row.electricity_pipe_rate) || 0,
          electricityRecycledRate: Number(row.electricity_recycled_rate) || 0,
          extras: Array.isArray(row.extra_costs)
            ? (row.extra_costs as { name?: unknown; amount?: unknown }[]).map((e) => ({
                name: String(e?.name ?? ''),
                amount: Number(e?.amount) || 0,
              }))
            : [],
          includeAppExpenses: row.include_app_expenses,
          updatedAt: row.updated_at,
        })
      }
      for (const row of ratesRes.data ?? []) {
        byCount.get(row.count_id)?.rates.set(row.raw_material_type_id, Number(row.rate_per_kg))
      }
      return byCount
    },
  })
}

/**
 * What an unsaved week's form starts with: no material prices, and each
 * per-kg rate as last saved (any week), else the default.
 */
export function newWeekMyCosts(saved: Map<string, SavedMyCosts>): MyCosts {
  const newestFirst = [...saved.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const lastRate = (pick: (c: MyCosts) => number, fallback: number) =>
    newestFirst.map(pick).find((rate) => rate > 0) ?? fallback
  return {
    rates: new Map(),
    operatorPipeRate: lastRate((c) => c.operatorPipeRate, DEFAULT_OPERATOR_PIPE_RATE),
    operatorRecycledRate: lastRate((c) => c.operatorRecycledRate, DEFAULT_OPERATOR_RECYCLED_RATE),
    electricityPipeRate: lastRate((c) => c.electricityPipeRate, 0),
    electricityRecycledRate: lastRate((c) => c.electricityRecycledRate, 0),
    extras: [],
    includeAppExpenses: false,
  }
}

export function useSaveMyCosts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { countId: string; costs: MyCosts }) => {
      const { costs } = input
      const { error } = await supabase.rpc('save_stock_check_my_costs', {
        p_count_id: input.countId,
        p_rates: [...costs.rates].map(([raw_material_type_id, rate_per_kg]) => ({ raw_material_type_id, rate_per_kg })),
        p_costs: {
          operator_pipe_rate: costs.operatorPipeRate,
          operator_recycled_rate: costs.operatorRecycledRate,
          electricity_pipe_rate: costs.electricityPipeRate,
          electricity_recycled_rate: costs.electricityRecycledRate,
          extra_costs: costs.extras,
          include_app_expenses: costs.includeAppExpenses,
        },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_COSTS_KEY }),
  })
}

export type ManualCostLine = {
  material: StockCheckMaterialRow
  /** The app's rate — the material's latest price. */
  appRate: number
  /** The user's price, or null to use the app's rate. */
  manualRate: number | null
  cost: number
}

/**
 * The week's cost per kg of pipe the owner's way. Only materials actually
 * used (more than 0 kg) are priced; one without a typed price keeps the
 * app's rate. Operator pay and electricity are per kg — pipe on the pipe
 * made, recycling on the recycled material used in production.
 */
export function myCostSummary(period: StockCheckPeriod, costs: MyCosts) {
  const lines: ManualCostLine[] = period.materials
    .filter((m) => m.consumed_kg > 0)
    .map((m) => {
      const appRate = m.consumed_cost / m.consumed_kg
      const manualRate = costs.rates.get(m.raw_material_type_id) ?? null
      return { material: m, appRate, manualRate, cost: m.consumed_kg * (manualRate ?? appRate) }
    })
  const materialCost = lines.reduce((sum, l) => sum + l.cost, 0)
  const usedKg = lines.reduce((sum, l) => sum + Number(l.material.consumed_kg), 0)
  const operatorPipe = period.produced_kg * costs.operatorPipeRate
  const operatorRecycled = period.recycled_used_kg * costs.operatorRecycledRate
  const electricityPipe = period.produced_kg * costs.electricityPipeRate
  const electricityRecycled = period.recycled_used_kg * costs.electricityRecycledRate
  const extrasCost = costs.extras.reduce((sum, e) => sum + e.amount, 0)
  const appExpenses = costs.includeAppExpenses ? period.overhead_cost : 0
  const totalCost =
    materialCost + operatorPipe + operatorRecycled + electricityPipe + electricityRecycled + extrasCost + appExpenses
  const costPerKg = period.produced_kg > 0 ? totalCost / period.produced_kg : null
  return {
    lines,
    usedKg,
    materialCost,
    operatorPipe,
    operatorRecycled,
    electricityPipe,
    electricityRecycled,
    extrasCost,
    appExpenses,
    totalCost,
    costPerKg,
  }
}

/* --------------------------------------------------------------------------
 * What 1 kg of pipe's cost is made of
 * ------------------------------------------------------------------------ */

export type CostPartKey = 'material' | 'electricity' | 'wages' | 'other' | 'expenses'

export type CostItem = {
  label: string
  /** Rupees for the whole cycle. */
  amount: number
  /** Rupees in 1 kg of pipe. */
  perKg: number
  /** Percent of the cost of 1 kg of pipe. */
  share: number
  /** Material only: kg of it used for each 1 kg of pipe made. */
  kgPerKg?: number
}

export type CostPart = CostItem & { key: CostPartKey; items: CostItem[] }

export type CostBreakdown = {
  /** 'mine' — from My Costs; 'app' — the app's own figures (no My Costs saved). */
  source: 'mine' | 'app'
  totalCost: number
  costPerKg: number
  producedKg: number
  /** Largest first; parts worth ₹0 are left out. */
  parts: CostPart[]
}

export const COST_PART_LABEL: Record<CostPartKey, string> = {
  material: 'Material',
  electricity: 'Electricity',
  wages: 'Wages',
  other: 'Other costs',
  expenses: 'Expenses in app',
}

/** App expense types that are electricity, by name — the app has no separate flag for it. */
const ELECTRICITY_NAME = /electric|current|power|eb bill|meter/i

/**
 * Splits the cost of 1 kg of pipe into material (each material, with how many
 * kg of it went into 1 kg of pipe), electricity, wages and other costs — each
 * as ₹ per kg and as a share of the price.
 *
 * Uses the owner's My Costs when saved; otherwise the app's own figures:
 * material at the latest purchase price, and the expenses recorded in the app
 * (salaries as wages, electricity by name, the rest as other).
 */
export function costBreakdown(period: StockCheckPeriod, saved?: MyCosts): CostBreakdown | null {
  const producedKg = Number(period.produced_kg)
  if (!(producedKg > 0)) return null

  type Raw = { key: CostPartKey; items: { label: string; amount: number; kg?: number }[] }
  let raw: Raw[]

  if (saved) {
    const s = myCostSummary(period, saved)
    raw = [
      {
        key: 'material',
        items: s.lines.map((l) => ({ label: l.material.material_name, amount: l.cost, kg: Number(l.material.consumed_kg) })),
      },
      {
        key: 'electricity',
        items: [
          { label: 'Pipe making', amount: s.electricityPipe },
          { label: 'Recycling', amount: s.electricityRecycled },
        ],
      },
      {
        key: 'wages',
        items: [
          { label: 'Operator - pipe', amount: s.operatorPipe },
          { label: 'Operator - recycling', amount: s.operatorRecycled },
        ],
      },
      { key: 'other', items: saved.extras.map((e) => ({ label: e.name, amount: e.amount })) },
      { key: 'expenses', items: [{ label: COST_PART_LABEL.expenses, amount: s.appExpenses }] },
    ]
  } else {
    const overheads = period.overheads.map((o) => ({ ...o, amount: Number(o.amount) }))
    raw = [
      {
        key: 'material',
        items: period.materials
          .filter((m) => m.consumed_kg > 0)
          .map((m) => ({ label: m.material_name, amount: Number(m.consumed_cost), kg: Number(m.consumed_kg) })),
      },
      {
        key: 'electricity',
        items: overheads
          .filter((o) => !o.is_salary && ELECTRICITY_NAME.test(o.category_name))
          .map((o) => ({ label: o.category_name, amount: o.amount })),
      },
      {
        key: 'wages',
        items: overheads.filter((o) => o.is_salary).map((o) => ({ label: o.category_name, amount: o.amount })),
      },
      {
        key: 'other',
        items: overheads
          .filter((o) => !o.is_salary && !ELECTRICITY_NAME.test(o.category_name))
          .map((o) => ({ label: o.category_name, amount: o.amount })),
      },
    ]
  }

  const totalCost = raw.reduce((sum, p) => sum + p.items.reduce((s, i) => s + i.amount, 0), 0)
  if (!(totalCost > 0)) return null

  const item = (label: string, amount: number, kg?: number): CostItem => ({
    label,
    amount,
    perKg: amount / producedKg,
    share: (amount / totalCost) * 100,
    ...(kg !== undefined ? { kgPerKg: kg / producedKg } : {}),
  })

  const parts: CostPart[] = raw
    .map((p) => {
      const items = p.items.filter((i) => i.amount > 0).map((i) => item(i.label, i.amount, i.kg))
      const amount = items.reduce((s, i) => s + i.amount, 0)
      const kg = p.key === 'material' ? p.items.reduce((s, i) => s + (i.kg ?? 0), 0) : undefined
      return { key: p.key, ...item(COST_PART_LABEL[p.key], amount, kg), items: items.sort((a, b) => b.amount - a.amount) }
    })
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  return { source: saved ? 'mine' : 'app', totalCost, costPerKg: totalCost / producedKg, producedKg, parts }
}
