import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/**
 * A "hub" screen — the pattern Khatabook / Vyapar use for Settings and
 * Reports: every section listed as a tile (icon, name, one-line description)
 * in labelled groups, and tapping one opens it full-screen with a back arrow.
 * Replaces long horizontal tab strips whose off-screen tabs nobody found.
 *
 * The open section lives in the URL (?<param>=key) so the phone's back button
 * returns to the hub, and other screens can link straight to a section.
 */
export function useHubSection<K extends string>(param: string, keys: readonly K[]) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const raw = searchParams.get(param)
  const active = keys.includes(raw as K) ? (raw as K) : null

  function open(key: K) {
    // Marked so "back" can pop this entry instead of pushing another one.
    setSearchParams({ [param]: key }, { state: { fromHub: true } })
    window.scrollTo({ top: 0 })
  }

  function close() {
    if ((location.state as { fromHub?: boolean } | null)?.fromHub) navigate(-1)
    else setSearchParams({}, { replace: true })
  }

  return { active, open, close }
}
