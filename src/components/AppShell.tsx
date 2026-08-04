import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MoreHorizontal, X } from 'lucide-react'
import { PRIMARY_NAV_ITEMS, SECONDARY_NAV_ITEMS, type NavItem } from '../lib/navigation'
import { SaiGangaLogo } from './SaiGangaLogo'

function IconBadge({ item, size }: { item: NavItem; size: 'lg' | 'sm' }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${item.badgeClass} ${
        size === 'lg' ? 'h-11 w-11' : 'h-8 w-8 rounded-lg'
      }`}
    >
      <item.icon className={size === 'lg' ? 'h-6 w-6' : 'h-[18px] w-[18px]'} strokeWidth={2.25} />
    </span>
  )
}

function SideNavRow({ item, size }: { item: NavItem; size: 'lg' | 'sm' }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl transition-colors ${
          size === 'lg' ? 'px-2.5 py-2.5' : 'px-2.5 py-2'
        } ${
          isActive
            ? 'bg-gradient-to-r from-brand-navy to-brand-navy-light text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`
      }
    >
      <IconBadge item={item} size={size} />
      <span className={size === 'lg' ? 'text-[15px] font-bold' : 'text-sm font-semibold'}>
        {item.label}
      </span>
    </NavLink>
  )
}

export function AppShell() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const isSecondaryActive = SECONDARY_NAV_ITEMS.some((item) => location.pathname.startsWith(item.path))

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Side nav — desktop */}
      <nav className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-slate-200 md:bg-white dark:md:border-slate-800 dark:md:bg-slate-900">
        <div className="bg-gradient-to-br from-brand-navy to-brand-navy-light px-4 py-5">
          <SaiGangaLogo className="h-14 w-auto" />
        </div>

        <ul className="flex flex-col gap-1.5 px-3 pt-4">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <li key={item.path}>
              <SideNavRow item={item} size="lg" />
            </li>
          ))}
        </ul>

        <div className="mx-6 my-4 border-t border-slate-200 dark:border-slate-800" />

        <ul className="flex flex-1 flex-col gap-1 px-3">
          {SECONDARY_NAV_ITEMS.map((item) => (
            <li key={item.path}>
              <SideNavRow item={item} size="sm" />
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2.5 bg-gradient-to-r from-brand-navy to-brand-navy-light px-4 py-2.5 md:hidden">
          <SaiGangaLogo compact className="h-7 w-7 shrink-0" />
          <h1 className="text-sm font-bold tracking-wide text-white">Sai Ganga</h1>
        </header>

        {/*
          Deliberately NOT a scroll container: `overflow-y-auto` here made
          `main` a scrollport that never actually scrolled (its height is
          content-driven), which silently killed every `position: sticky`
          Save bar inside it and swallowed horizontal overflow into a
          sideways scroll nobody could see. Letting the document scroll
          instead is also what mobile browsers optimise for — URL-bar hiding
          and momentum scrolling both come back.
        */}
        <main
          className="min-w-0 flex-1 p-4"
          style={{ paddingBottom: 'calc(var(--app-bottom-nav-h) + 1rem)' }}
        >
          <Outlet />
        </main>

        {/* "More" sheet — mobile, holds Records / Reports / Settings */}
        {moreOpen && (
          <div className="fixed inset-0 z-20 md:hidden" role="dialog" aria-label="More">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => setMoreOpen(false)}
            />
            <div
              className="absolute inset-x-0 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900"
              style={{ bottom: 'var(--app-bottom-nav-h)' }}
            >
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">More</span>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setMoreOpen(false)}
                  className="-mr-1 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ul className="flex flex-col gap-1">
                {SECONDARY_NAV_ITEMS.map((item) => (
                  <li key={item.path} onClick={() => setMoreOpen(false)}>
                    <SideNavRow item={item} size="lg" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Bottom nav — mobile: large, colorful, distinct-shape icon badges so
            each action is recognizable by color/shape alone. Its height plus
            the phone's home-indicator inset is --app-bottom-nav-h, which every
            page and the sticky Save bar clear. */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.04)] md:hidden dark:border-slate-800 dark:bg-slate-900"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {PRIMARY_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl text-white transition-transform ${item.badgeClass} ${
                      isActive ? 'scale-110 shadow-md' : 'opacity-80'
                    }`}
                  >
                    <item.icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
                  </span>
                  <span
                    className={`max-w-full truncate px-0.5 text-[11px] font-bold leading-none ${
                      isActive ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2"
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-xl text-white transition-transform ${
                isSecondaryActive ? 'scale-110 bg-slate-500 shadow-md' : 'bg-slate-400 opacity-80'
              }`}
            >
              <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </span>
            <span
              className={`max-w-full truncate px-0.5 text-[11px] font-bold leading-none ${
                isSecondaryActive ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              More
            </span>
          </button>
        </nav>
      </div>
    </div>
  )
}
