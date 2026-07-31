import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Catches render-time errors anywhere below it so one broken screen shows a
 * friendly fallback instead of a blank white page — the exact failure mode
 * the Edit Bill crash produced before it was fixed at the source. This is a
 * backstop for the *next* one, not a substitute for fixing root causes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center dark:bg-slate-950">
          <span className="rounded-full bg-red-100 p-3 text-red-600 dark:bg-red-950/60 dark:text-red-400">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Something went wrong
          </p>
          <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">
            The screen hit an unexpected error. Your saved data is safe — this only affected the
            current view.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null })
              window.location.assign('/')
            }}
            className="mt-1 inline-flex items-center rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Go to Home
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
