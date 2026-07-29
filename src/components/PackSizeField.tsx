import { useState } from 'react'
import { Chip } from './Chip'

type PackSizeFieldProps = {
  value: number | null
  onChange: (kg: number) => void
  options?: number[]
  chipSelectedClass?: string
}

export function PackSizeField({
  value,
  onChange,
  options = [25, 50],
  chipSelectedClass,
}: PackSizeFieldProps) {
  const isPreset = value !== null && options.includes(value)
  const [showCustom, setShowCustom] = useState(!isPreset && value !== null)
  const [customText, setCustomText] = useState(!isPreset && value !== null ? String(value) : '')

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip
            key={o}
            label={`${o}kg`}
            selected={!showCustom && value === o}
            selectedClass={chipSelectedClass}
            onClick={() => {
              setShowCustom(false)
              onChange(o)
            }}
          />
        ))}
        <Chip
          label="Custom"
          selected={showCustom}
          selectedClass={chipSelectedClass}
          onClick={() => setShowCustom(true)}
        />
      </div>
      {showCustom && (
        <input
          type="number"
          min="0"
          inputMode="decimal"
          placeholder="Bag size (kg)"
          value={customText}
          onChange={(e) => {
            setCustomText(e.target.value)
            const n = Number(e.target.value)
            if (n > 0) onChange(n)
          }}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-800"
        />
      )}
    </div>
  )
}
