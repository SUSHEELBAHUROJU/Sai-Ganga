import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type PurchaseReportLine = {
  entry_date: string
  supplier: string
  item: string
  quantityKg: number
  /** null on rows recorded before a purchase price was required — shown as
   *  "—" rather than 0.00, which would read as "this cost nothing". */
  purchasePrice: number | null
  transport: number
  total: number | null
}

export type ExpenseReportLine = {
  entry_date: string
  category: string
  amount: number
  notes: string | null
}

export type ExpenseReport = {
  purchases: PurchaseReportLine[]
  salaries: ExpenseReportLine[]
  otherExpenses: ExpenseReportLine[]
  totals: {
    purchaseCost: number
    transport: number
    purchaseTotal: number
    salaries: number
    otherExpenses: number
    grandTotal: number
  }
}

/**
 * Everything that money went out on in a period: both kinds of purchase plus
 * every recorded expense. Rows are fetched directly rather than aggregated in
 * Postgres because the report lists each transaction individually — the same
 * reasoning useDailyReport applies to its purchase lists, and the volumes here
 * (purchases and expenses for a month) are small.
 *
 * Legacy rows are tolerated throughout: cost was optional before it became
 * mandatory, and suppliers were free text, so both are coalesced rather than
 * assumed present.
 */
export function useExpenseReport(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['reports', 'expenses', fromDate, toDate],
    queryFn: async (): Promise<ExpenseReport> => {
      const [rawPurchases, scrapPurchases, expenses] = await Promise.all([
        supabase
          .from('raw_material_purchases')
          .select(
            'entry_date, total_qty_kg, cost, transport_charges, supplier_name, raw_material_types(name), raw_material_suppliers(name)',
          )
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .order('entry_date', { ascending: true }),
        supabase
          .from('scrap_purchases')
          .select(
            'entry_date, quantity_kg, cost, transport_charges, scrap_dealers(name), scrap_types(name)',
          )
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .order('entry_date', { ascending: true }),
        supabase
          .from('expenses')
          .select('entry_date, amount, notes, expense_categories(name, is_salary)')
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .order('entry_date', { ascending: true }),
      ])

      for (const result of [rawPurchases, scrapPurchases, expenses]) {
        if (result.error) throw result.error
      }

      const toLine = (
        entry_date: string,
        supplier: string,
        item: string,
        quantityKg: number,
        costRaw: unknown,
        transportRaw: unknown,
      ): PurchaseReportLine => {
        const purchasePrice = costRaw == null ? null : Number(costRaw) || 0
        const transport = Number(transportRaw) || 0
        return {
          entry_date,
          supplier,
          item,
          quantityKg,
          purchasePrice,
          transport,
          total: purchasePrice === null ? null : purchasePrice + transport,
        }
      }

      const purchases: PurchaseReportLine[] = [
        ...((rawPurchases.data ?? []) as any[]).map((r) =>
          toLine(
            r.entry_date,
            r.raw_material_suppliers?.name ?? r.supplier_name ?? '—',
            r.raw_material_types?.name ?? 'Raw material',
            Number(r.total_qty_kg) || 0,
            r.cost,
            r.transport_charges,
          ),
        ),
        ...((scrapPurchases.data ?? []) as any[]).map((r) =>
          toLine(
            r.entry_date,
            r.scrap_dealers?.name ?? '—',
            r.scrap_types?.name ?? 'Scrap',
            Number(r.quantity_kg) || 0,
            r.cost,
            r.transport_charges,
          ),
        ),
      ].sort((a, b) => a.entry_date.localeCompare(b.entry_date))

      const salaries: ExpenseReportLine[] = []
      const otherExpenses: ExpenseReportLine[] = []
      for (const row of (expenses.data ?? []) as any[]) {
        const line: ExpenseReportLine = {
          entry_date: row.entry_date,
          category: row.expense_categories?.name ?? 'Uncategorised',
          amount: Number(row.amount) || 0,
          notes: row.notes,
        }
        if (row.expense_categories?.is_salary) salaries.push(line)
        else otherExpenses.push(line)
      }

      const sum = (nums: number[]) => nums.reduce((a, b) => a + b, 0)
      const purchaseCost = sum(purchases.map((p) => p.purchasePrice ?? 0))
      const transport = sum(purchases.map((p) => p.transport))
      const salaryTotal = sum(salaries.map((s) => s.amount))
      const otherTotal = sum(otherExpenses.map((e) => e.amount))

      return {
        purchases,
        salaries,
        otherExpenses,
        totals: {
          purchaseCost,
          transport,
          purchaseTotal: purchaseCost + transport,
          salaries: salaryTotal,
          otherExpenses: otherTotal,
          grandTotal: purchaseCost + transport + salaryTotal + otherTotal,
        },
      }
    },
  })
}
