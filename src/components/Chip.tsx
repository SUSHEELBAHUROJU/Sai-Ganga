type ChipProps = {
  label: string
  selected?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  /** Selected-state classes (border+bg+text) — tint to the screen's action color. Defaults to teal. */
  selectedClass?: string
}

export function Chip({
  label,
  selected = false,
  onClick,
  type = 'button',
  selectedClass = 'border-teal-600 bg-teal-600 text-white',
}: ChipProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`min-h-[40px] shrink-0 rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ${
        selected
          ? `${selectedClass} shadow-sm`
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600'
      }`}
    >
      {label}
    </button>
  )
}
