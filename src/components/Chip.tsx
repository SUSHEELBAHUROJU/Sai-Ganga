type ChipProps = {
  label: string
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  /** Selected-state classes (border+bg+text) — tint to the screen's action color. Defaults to teal. */
  selectedClass?: string
}

export function Chip({
  label,
  selected = false,
  disabled = false,
  onClick,
  type = 'button',
  selectedClass = 'border-teal-600 bg-teal-600 text-white',
}: ChipProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      // max-w-full + truncate: a chip carrying a long customer/dealer name
      // ("Anantha Padmanabha Irrigation Systems") is wider than a 320px
      // screen on its own, and shrink-0 meant it pushed the page sideways.
      className={`min-h-[44px] max-w-full shrink-0 truncate rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ${
        disabled
          ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500'
          : selected
            ? `${selectedClass} shadow-sm`
            : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600'
      }`}
    >
      {label}
    </button>
  )
}

