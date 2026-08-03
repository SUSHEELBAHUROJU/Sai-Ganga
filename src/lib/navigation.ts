import { Home, History, Settings, Wallet, type LucideIcon } from 'lucide-react'
import { ACTION_STYLES } from './actionColors'

export type NavItem = {
  path: string
  label: string
  icon: LucideIcon
  /** Solid badge color behind the icon — same color everywhere this concept appears. */
  badgeClass: string
}

// Primary = the four things done every day; kept prominent everywhere.
// Secondary = occasional screens, grouped under "More" so they don't compete
// visually with the daily actions (still reachable within 2 taps from Home).
export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Home', icon: Home, badgeClass: 'bg-brand-red' },
  {
    path: '/production/add',
    label: 'Production',
    icon: ACTION_STYLES.production.icon,
    badgeClass: ACTION_STYLES.production.solid,
  },
  {
    path: '/sales/add',
    label: 'Sale',
    icon: ACTION_STYLES.sale.icon,
    badgeClass: ACTION_STYLES.sale.solid,
  },
  {
    path: '/purchases/add',
    label: 'Purchase',
    icon: ACTION_STYLES.purchase.icon,
    badgeClass: ACTION_STYLES.purchase.solid,
  },
]

export const SECONDARY_NAV_ITEMS: NavItem[] = [
  { path: '/records', label: 'Records', icon: History, badgeClass: 'bg-slate-500' },
  { path: '/ledger', label: 'Ledger', icon: Wallet, badgeClass: 'bg-red-500' },
  {
    path: '/reports',
    label: 'Reports',
    icon: ACTION_STYLES.stock.icon,
    badgeClass: ACTION_STYLES.stock.solid,
  },
  { path: '/settings', label: 'Settings', icon: Settings, badgeClass: 'bg-slate-500' },
]

export const NAV_ITEMS: NavItem[] = [...PRIMARY_NAV_ITEMS, ...SECONDARY_NAV_ITEMS]
