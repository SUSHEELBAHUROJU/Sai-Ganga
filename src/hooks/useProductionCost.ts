import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { piecesToKg } from '../lib/format'

export type ProductionCostMaterial = {
  raw_material_type_id: string
  material_name: string
  consumed_kg: number
  consumed_cost: number
  unpriced_kg: number
}

export type ProductionCostOverhead = {
  name: string
  amount: number
  units: number | null
}

export type ProductionCostReport = {
  materials: ProductionCostMaterial[]
  materialCost: number
  materialKg: number
  unpricedKg: number
  /** Part of the material comes from a stock-check week that runs past the
   *  range, shared by days — an estimate. */
  isEstimated: boolean
  /** Days the material figures stand for — null when no count covers the range. */
  coveredFrom: string | null
  coveredTo: string | null
  /** Pipe made on exactly the covered days, so material ₹/kg compares like with like. */
  coveredProducedKg: number
  overheads: ProductionCostOverhead[]
  overheadCost: number
  units: number | null
  production: { pipe_product_id: string; diameter_inches: number; weight_kg: number; pcs: number; kg: number }[]
  producedKg: number
  producedPcs: number
}

/**
 * Cost of making pipe over a calendar range (normally a month): material from
 * the stock counts, running costs from expenses counted in the period they're
 * for, and production from the entries themselves.
 */
export function useProductionCost(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['reports', 'production_cost', fromDate, toDate],
    // Moves with stock counts, purchases and expenses — always re-read.
    staleTime: 0,
    queryFn: async (): Promise<ProductionCostReport> => {
      const [materialRes, expenseRes, productionRes] = await Promise.all([
        supabase.rpc('rpc_period_material_cost', { p_from: fromDate, p_to: toDate }),
        supabase.rpc('expense_allocations', { p_from: fromDate, p_to: toDate }),
        supabase.rpc('rpc_production_totals_by_product', { p_from: fromDate, p_to: toDate }),
      ])
      if (materialRes.error) throw materialRes.error
      if (expenseRes.error) throw expenseRes.error
      if (productionRes.error) throw productionRes.error

      const materialRows = materialRes.data ?? []
      const materials: ProductionCostMaterial[] = materialRows.map((m) => ({
        raw_material_type_id: m.raw_material_type_id,
        material_name: m.material_name,
        consumed_kg: Number(m.consumed_kg) || 0,
        consumed_cost: Number(m.consumed_cost) || 0,
        unpriced_kg: Number(m.unpriced_kg) || 0,
      }))
      const first = materialRows[0]

      const byCategory = new Map<string, ProductionCostOverhead>()
      for (const row of expenseRes.data ?? []) {
        if (!row.in_production_cost) continue
        const entry = byCategory.get(row.category_id) ?? { name: row.category_name, amount: 0, units: null }
        entry.amount += Number(row.allocated_amount) || 0
        if (row.allocated_units != null) entry.units = (entry.units ?? 0) + Number(row.allocated_units)
        byCategory.set(row.category_id, entry)
      }
      const overheads = [...byCategory.values()].sort((a, b) => b.amount - a.amount)
      const unitRows = overheads.filter((o) => o.units !== null)

      const production = (productionRes.data ?? [])
        .map((p) => ({
          pipe_product_id: p.pipe_product_id,
          diameter_inches: p.diameter_inches,
          weight_kg: p.weight_kg,
          pcs: Number(p.total_pcs) || 0,
          kg: piecesToKg(Number(p.total_pcs) || 0, p.weight_kg),
        }))
        .sort((a, b) => a.diameter_inches - b.diameter_inches || a.weight_kg - b.weight_kg)

      return {
        materials,
        materialCost: materials.reduce((s, m) => s + m.consumed_cost, 0),
        materialKg: materials.reduce((s, m) => s + m.consumed_kg, 0),
        unpricedKg: materials.reduce((s, m) => s + m.unpriced_kg, 0),
        isEstimated: materialRows.some((m) => m.is_estimated),
        coveredFrom: first?.covered_from ?? null,
        coveredTo: first?.covered_to ?? null,
        coveredProducedKg: Number(first?.covered_produced_kg) || 0,
        overheads,
        overheadCost: overheads.reduce((s, o) => s + o.amount, 0),
        units: unitRows.length ? unitRows.reduce((s, o) => s + (o.units ?? 0), 0) : null,
        production,
        producedKg: production.reduce((s, p) => s + p.kg, 0),
        producedPcs: production.reduce((s, p) => s + p.pcs, 0),
      }
    },
  })
}
