import { Check } from 'lucide-react'
import { ACTION_STYLES, type ActionKey } from '../lib/actionColors'

type SaveButtonProps = {
  accent: ActionKey
  onClick: () => void
  disabled?: boolean
  pending?: boolean
  label: string
  pendingLabel?: string
}

/** Big, always-in-the-same-color Save button — same gradient every time this action appears. */
export function SaveButton({
  accent,
  onClick,
  disabled = false,
  pending = false,
  label,
  pendingLabel = 'Saving…',
}: SaveButtonProps) {
  const style = ACTION_STYLES[accent]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className={`flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${style.gradient}`}
    >
      {!pending && <Check className="h-[18px] w-[18px]" strokeWidth={3} />}
      {pending ? pendingLabel : label}
    </button>
  )
}
