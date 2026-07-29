import { Factory, ShoppingCart, Truck, Boxes, Recycle, type LucideIcon } from 'lucide-react'

/**
 * One color per concept, used everywhere that concept appears — nav icons,
 * Home cards, entry-screen accents, Records tags — so a user learns
 * "blue = making pipes, green = selling, orange = buying" without reading.
 * Never reassign a key's color/icon once shipped; consistency is the point.
 */
export type ActionKey = 'production' | 'sale' | 'purchase' | 'stock' | 'recycling'

export type ActionStyle = {
  icon: LucideIcon
  label: string
  /** Large card / header backgrounds. */
  gradient: string
  /** Small pills, badges, dots. */
  solid: string
  text: string
  textDark: string
  border: string
  ring: string
  /** Chip selected-state background. */
  chipSelected: string
}

export const ACTION_STYLES: Record<ActionKey, ActionStyle> = {
  production: {
    icon: Factory,
    label: 'Production',
    gradient: 'bg-gradient-to-br from-sky-500 to-blue-700',
    solid: 'bg-blue-600',
    text: 'text-blue-700',
    textDark: 'dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-900',
    ring: 'ring-blue-500',
    chipSelected: 'border-blue-600 bg-blue-600 text-white',
  },
  sale: {
    icon: ShoppingCart,
    label: 'Sale',
    gradient: 'bg-gradient-to-br from-emerald-500 to-green-700',
    solid: 'bg-green-600',
    text: 'text-green-700',
    textDark: 'dark:text-green-400',
    border: 'border-green-200 dark:border-green-900',
    ring: 'ring-green-500',
    chipSelected: 'border-green-600 bg-green-600 text-white',
  },
  purchase: {
    icon: Truck,
    label: 'Purchase',
    gradient: 'bg-gradient-to-br from-orange-400 to-orange-600',
    solid: 'bg-orange-500',
    text: 'text-orange-700',
    textDark: 'dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-900',
    ring: 'ring-orange-500',
    chipSelected: 'border-orange-500 bg-orange-500 text-white',
  },
  stock: {
    icon: Boxes,
    label: 'Stock',
    gradient: 'bg-gradient-to-br from-violet-500 to-purple-700',
    solid: 'bg-purple-600',
    text: 'text-purple-700',
    textDark: 'dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-900',
    ring: 'ring-purple-500',
    chipSelected: 'border-purple-600 bg-purple-600 text-white',
  },
  recycling: {
    icon: Recycle,
    label: 'Recycling',
    gradient: 'bg-gradient-to-br from-teal-500 to-teal-700',
    solid: 'bg-teal-600',
    text: 'text-teal-700',
    textDark: 'dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-900',
    ring: 'ring-teal-500',
    chipSelected: 'border-teal-600 bg-teal-600 text-white',
  },
}
