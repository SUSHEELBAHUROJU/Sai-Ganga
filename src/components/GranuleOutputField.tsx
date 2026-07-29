import { Chip } from './Chip'
import { NumberStepper } from './NumberStepper'
import { PackSizeField } from './PackSizeField'

export type OutputEntryMode = 'bag' | 'direct_kg'

export type GranuleOutput = {
  mode: OutputEntryMode
  packKg: number | null
  numBags: string
  directKg: string
}

export const EMPTY_GRANULE_OUTPUT: GranuleOutput = {
  mode: 'bag',
  packKg: 25,
  numBags: '',
  directKg: '',
}

/** Total granules produced, from whichever mode the user is using. */
export function granuleTotalKg(output: GranuleOutput): number {
  if (output.mode === 'bag') {
    return (output.packKg ?? 0) * Number(output.numBags || 0)
  }
  return Number(output.directKg || 0)
}

type GranuleOutputFieldProps = {
  value: GranuleOutput
  onChange: (next: GranuleOutput) => void
  chipSelectedClass?: string
  stepperAccentClass?: string
}

export function GranuleOutputField({
  value,
  onChange,
  chipSelectedClass,
  stepperAccentClass,
}: GranuleOutputFieldProps) {
  const patch = (next: Partial<GranuleOutput>) => onChange({ ...value, ...next })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Chip
          label="By bags"
          selected={value.mode === 'bag'}
          selectedClass={chipSelectedClass}
          onClick={() => patch({ mode: 'bag' })}
        />
        <Chip
          label="Direct total"
          selected={value.mode === 'direct_kg'}
          selectedClass={chipSelectedClass}
          onClick={() => patch({ mode: 'direct_kg' })}
        />
      </div>

      {value.mode === 'bag' ? (
        <>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Pack size
            </span>
            <PackSizeField
              value={value.packKg}
              onChange={(packKg) => patch({ packKg })}
              chipSelectedClass={chipSelectedClass}
            />
          </div>
          <NumberStepper
            label="How Many Bags?"
            value={value.numBags}
            onChange={(numBags) => patch({ numBags })}
            accentClass={stepperAccentClass}
          />
        </>
      ) : (
        <NumberStepper
          label="Granules Produced (kg)"
          value={value.directKg}
          onChange={(directKg) => patch({ directKg })}
          allowDecimal
          step={5}
          accentClass={stepperAccentClass}
        />
      )}
    </div>
  )
}
