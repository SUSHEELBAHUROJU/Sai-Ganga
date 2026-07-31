import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
})

/**
 * For master data that rarely changes (products, material/scrap types,
 * dealers, customers, settings) — avoids re-fetching on every screen
 * navigation. Mutations on these tables still invalidate their query key
 * immediately, so this only affects how long an *unrelated* navigation can
 * serve a cached copy before revalidating, not staleness after an edit.
 */
export const MASTER_DATA_STALE_TIME = 5 * 60 * 1000
