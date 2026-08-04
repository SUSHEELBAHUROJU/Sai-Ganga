import { useState } from 'react'
import { DateField } from '../components/DateField'
import { RawMaterialPurchaseForm } from './purchase/RawMaterialPurchaseForm'
import { ScrapPurchaseForm } from './purchase/ScrapPurchaseForm'
import { FactoryWasteQuickEntry } from './purchase/FactoryWasteQuickEntry'
import { ACTION_STYLES } from '../lib/actionColors'
import { todayISODate } from '../lib/date'

type Mode = 'raw_material' | 'scrap'

export function RecordPurchasePage() {
  const [entryDate, setEntryDate] = useState(todayISODate())
  const [mode, setMode] = useState<Mode>('raw_material')

  return (
    <div className="space-y-6 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Add a Purchase</h2>
        <DateField value={entryDate} onChange={setEntryDate} />
      </div>

      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setMode('raw_material')}
          className={`min-h-[48px] flex-1 rounded-xl text-base font-bold transition-colors ${
            mode === 'raw_material'
              ? `${ACTION_STYLES.purchase.gradient} text-white shadow-sm`
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Raw Material
        </button>
        <button
          type="button"
          onClick={() => setMode('scrap')}
          className={`min-h-[48px] flex-1 rounded-xl text-base font-bold transition-colors ${
            mode === 'scrap'
              ? `${ACTION_STYLES.purchase.gradient} text-white shadow-sm`
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Scrap Purchase
        </button>
      </div>

      {mode === 'raw_material' ? (
        <RawMaterialPurchaseForm entryDate={entryDate} />
      ) : (
        <ScrapPurchaseForm entryDate={entryDate} />
      )}

      <FactoryWasteQuickEntry />
    </div>
  )
}
