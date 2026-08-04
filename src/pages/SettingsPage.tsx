import { useState } from 'react'
import { PipeSizesTab } from './settings/PipeSizesTab'
import { RawMaterialsTab } from './settings/RawMaterialsTab'
import { CustomersTab } from './settings/CustomersTab'
import { ScrapDealersTab } from './settings/ScrapDealersTab'
import { ScrapTypesTab } from './settings/ScrapTypesTab'
import { StockSettingsTab } from './settings/StockSettingsTab'
import { SecurityTab } from './settings/SecurityTab'
import { BackupTab } from './settings/BackupTab'
import { BillingSettingsTab } from './settings/BillingSettingsTab'

const TABS = [
  { key: 'pipe_sizes', label: 'Pipe Sizes' },
  { key: 'raw_materials', label: 'Raw Materials' },
  { key: 'customers', label: 'Customers' },
  { key: 'scrap_dealers', label: 'Scrap Dealers' },
  { key: 'scrap_types', label: 'Scrap Types' },
  { key: 'stock_settings', label: 'Stock Settings' },
  { key: 'billing', label: 'Billing Settings' },
  { key: 'backup', label: 'Backup' },
  { key: 'security', label: 'Security' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('pipe_sizes')

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Settings</h2>

      <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[44px] shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'pipe_sizes' && <PipeSizesTab />}
      {activeTab === 'raw_materials' && <RawMaterialsTab />}
      {activeTab === 'customers' && <CustomersTab />}
      {activeTab === 'scrap_dealers' && <ScrapDealersTab />}
      {activeTab === 'scrap_types' && <ScrapTypesTab />}
      {activeTab === 'stock_settings' && <StockSettingsTab />}
      {activeTab === 'billing' && <BillingSettingsTab />}
      {activeTab === 'backup' && <BackupTab />}
      {activeTab === 'security' && <SecurityTab />}
    </div>
  )
}
