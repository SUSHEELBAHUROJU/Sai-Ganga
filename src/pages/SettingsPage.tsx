import type { ReactNode } from 'react'
import {
  Bell,
  Boxes,
  DatabaseBackup,
  ReceiptIndianRupee,
  Recycle,
  Ruler,
  ShieldCheck,
  Store,
  Tags,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { PipeSizesTab } from './settings/PipeSizesTab'
import { RawMaterialsTab } from './settings/RawMaterialsTab'
import { CustomersTab } from './settings/CustomersTab'
import { ScrapDealersTab } from './settings/ScrapDealersTab'
import { SuppliersTab } from './settings/SuppliersTab'
import { ScrapTypesTab } from './settings/ScrapTypesTab'
import { ExpenseTypesTab } from './settings/ExpenseTypesTab'
import { StockSettingsTab } from './settings/StockSettingsTab'
import { SecurityTab } from './settings/SecurityTab'
import { BackupTab } from './settings/BackupTab'
import { BillingSettingsTab } from './settings/BillingSettingsTab'
import { HubGroup, HubSectionHeader, HubTile } from '../components/Hub'
import { useHubSection } from '../hooks/useHubSection'
import { usePipeProducts } from '../hooks/usePipeProducts'
import { useRawMaterialTypes } from '../hooks/useRawMaterialTypes'
import { useScrapTypes } from '../hooks/useScrapTypes'
import { useExpenseCategories } from '../hooks/useExpenseCategories'
import { useCustomers } from '../hooks/useCustomers'
import { useSuppliers } from '../hooks/useSuppliers'
import { useScrapDealers } from '../hooks/useScrapDealers'
import { useCompanySettings } from '../hooks/useCompanySettings'
import { isPinSet } from '../lib/pin'

type Section = {
  key: string
  title: string
  description: string
  icon: LucideIcon
  iconClass: string
  render: () => ReactNode
}

const SECTIONS = {
  billing: {
    key: 'billing',
    title: 'Bill Settings',
    description: 'Shop name and bill number',
    icon: ReceiptIndianRupee,
    iconClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    render: () => <BillingSettingsTab />,
  },
  stock_settings: {
    key: 'stock_settings',
    title: 'Stock Alert',
    description: 'Warning when stock is low, starting stock',
    icon: Bell,
    iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    render: () => <StockSettingsTab />,
  },
  pipe_sizes: {
    key: 'pipe_sizes',
    title: 'Pipe Sizes',
    description: 'Pipes you make and sell',
    icon: Ruler,
    iconClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    render: () => <PipeSizesTab />,
  },
  raw_materials: {
    key: 'raw_materials',
    title: 'Raw Material',
    description: 'Granules and material you buy',
    icon: Boxes,
    iconClass: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
    render: () => <RawMaterialsTab />,
  },
  scrap_types: {
    key: 'scrap_types',
    title: 'Scrap Types',
    description: 'Scrap you buy, and wastage %',
    icon: Recycle,
    iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    render: () => <ScrapTypesTab />,
  },
  expense_types: {
    key: 'expense_types',
    title: 'Expense Types',
    description: 'Salary, current bill, rent, diesel',
    icon: Tags,
    iconClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    render: () => <ExpenseTypesTab />,
  },
  customers: {
    key: 'customers',
    title: 'Customers',
    description: 'People who buy pipes from you',
    icon: Users,
    iconClass: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
    render: () => <CustomersTab />,
  },
  suppliers: {
    key: 'suppliers',
    title: 'Suppliers',
    description: 'People you buy material from',
    icon: Truck,
    iconClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
    render: () => <SuppliersTab />,
  },
  scrap_dealers: {
    key: 'scrap_dealers',
    title: 'Scrap Dealers',
    description: 'People you buy scrap from',
    icon: Store,
    iconClass: 'bg-lime-100 text-lime-700 dark:bg-lime-950/60 dark:text-lime-300',
    render: () => <ScrapDealersTab />,
  },
  backup: {
    key: 'backup',
    title: 'Download Data',
    description: 'Save all entries as Excel file',
    icon: DatabaseBackup,
    iconClass: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    render: () => <BackupTab />,
  },
  security: {
    key: 'security',
    title: 'App Lock',
    description: 'PIN lock and logout',
    icon: ShieldCheck,
    iconClass: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    render: () => <SecurityTab />,
  },
} satisfies Record<string, Section>

type SectionKey = keyof typeof SECTIONS
const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[]

const GROUPS: { title: string; keys: SectionKey[] }[] = [
  { title: 'My Business', keys: ['billing', 'stock_settings'] },
  { title: 'Items', keys: ['pipe_sizes', 'raw_materials', 'scrap_types', 'expense_types'] },
  { title: 'Parties', keys: ['customers', 'suppliers', 'scrap_dealers'] },
  { title: 'Backup & Safety', keys: ['backup', 'security'] },
]

/** "14 sizes" — active items only; nothing while the list is still loading. */
function countLabel(rows: { is_active: boolean | null }[] | undefined, singular: string, plural: string) {
  if (!rows) return null
  const n = rows.filter((r) => r.is_active !== false).length
  return `${n} ${n === 1 ? singular : plural}`
}

export function SettingsPage() {
  const { active, open, close } = useHubSection<SectionKey>('section', SECTION_KEYS)

  if (active) {
    const section = SECTIONS[active]
    return (
      <div className="pb-4">
        <HubSectionHeader hubLabel="Settings" title={section.title} description={section.description} onBack={close} />
        {section.render()}
      </div>
    )
  }

  return <SettingsHub onOpen={open} />
}

function SettingsHub({ onOpen }: { onOpen: (key: SectionKey) => void }) {
  // Master data is cached app-wide, so these counts are usually free.
  const { data: pipes } = usePipeProducts()
  const { data: materials } = useRawMaterialTypes()
  const { data: scrapTypes } = useScrapTypes()
  const { data: expenseTypes } = useExpenseCategories()
  const { data: customers } = useCustomers()
  const { data: suppliers } = useSuppliers()
  const { data: dealers } = useScrapDealers()
  const { data: company } = useCompanySettings()

  const meta: Partial<Record<SectionKey, string | null>> = {
    billing: company ? `Next bill ${company.bill_prefix}${String(company.next_bill_number).padStart(4, '0')}` : null,
    pipe_sizes: countLabel(pipes, 'size', 'sizes'),
    raw_materials: countLabel(materials, 'material', 'materials'),
    scrap_types: countLabel(scrapTypes, 'type', 'types'),
    expense_types: countLabel(expenseTypes, 'type', 'types'),
    customers: countLabel(customers, 'customer', 'customers'),
    suppliers: countLabel(suppliers, 'supplier', 'suppliers'),
    scrap_dealers: countLabel(dealers, 'dealer', 'dealers'),
    security: isPinSet() ? 'PIN on' : 'PIN off',
  }

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Settings</h2>
        {company?.business_name && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{company.business_name}</p>
        )}
      </div>

      {GROUPS.map((group) => (
        <HubGroup key={group.title} title={group.title}>
          {group.keys.map((key) => {
            const s = SECTIONS[key]
            return (
              <HubTile
                key={key}
                icon={s.icon}
                iconClass={s.iconClass}
                title={s.title}
                description={s.description}
                meta={meta[key]}
                onClick={() => onOpen(key)}
              />
            )
          })}
        </HubGroup>
      ))}
    </div>
  )
}
