import { useState } from 'react'
import { DateField } from '../components/DateField'
import { useEntryDate } from '../hooks/useEntryDate'
import { ACTION_STYLES } from '../lib/actionColors'
import { PipesTab } from './production/PipesTab'
import { RecycledGranulesTab } from './production/RecycledGranulesTab'

type Tab = 'pipes' | 'granules'

export function AddProductionPage() {
  const [entryDate, setEntryDate] = useEntryDate()
  const [tab, setTab] = useState<Tab>('pipes')

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Add Production</h2>
        <DateField value={entryDate} onChange={setEntryDate} />
      </div>

      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setTab('pipes')}
          className={`min-h-[48px] flex-1 rounded-xl text-base font-bold transition-colors ${
            tab === 'pipes'
              ? `${ACTION_STYLES.production.gradient} text-white shadow-sm`
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Pipes
        </button>
        <button
          type="button"
          onClick={() => setTab('granules')}
          className={`min-h-[48px] flex-1 rounded-xl text-base font-bold transition-colors ${
            tab === 'granules'
              ? `${ACTION_STYLES.recycling.gradient} text-white shadow-sm`
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Recycled Granules
        </button>
      </div>

      {/*
        Both tabs stay mounted and are only hidden via CSS — switching tabs
        must not lose unsaved input, and conditionally rendering one or the
        other would unmount it and wipe its local state (cart lines, the
        recycling form fields, etc).
      */}
      <div className={tab === 'pipes' ? '' : 'hidden'}>
        <PipesTab entryDate={entryDate} />
      </div>
      <div className={tab === 'granules' ? '' : 'hidden'}>
        <RecycledGranulesTab entryDate={entryDate} />
      </div>
    </div>
  )
}
