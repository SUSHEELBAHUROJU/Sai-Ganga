import { useState, type ReactNode } from 'react'
import { usePipeProducts } from '../../hooks/usePipeProducts'
import { useRawMaterialTypes } from '../../hooks/useRawMaterialTypes'
import { useScrapTypes } from '../../hooks/useScrapTypes'
import type {
  ProductionRecordRow,
  SaleRecordRow,
  RecyclingRecordRow,
  RawPurchaseRecordRow,
  ScrapPurchaseRecordRow,
  FactoryWasteRecordRow,
} from '../../hooks/useRecords'
import type { EntryMode } from '../../hooks/useRawMaterialPurchases'
import { DateField } from '../../components/DateField'
import { Chip } from '../../components/Chip'
import { Field } from '../../components/Field'
import { PackSizeField } from '../../components/PackSizeField'
import {
  GranuleOutputField,
  granuleTotalKg,
  type GranuleOutput,
} from '../../components/GranuleOutputField'
import { PipeProductPicker } from '../../components/PipeProductPicker'
import { CustomerPicker } from '../../components/CustomerPicker'
import { ScrapDealerPicker } from '../../components/ScrapDealerPicker'
import { formatQty } from '../../lib/format'

/** A form reports its patch (or null when invalid) via `onValidChange`. */
export type EditFormProps<Row> = {
  row: Row
  onChange: (patch: Record<string, unknown> | null) => void
}

function FormShell({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>
}

function DateRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Date</span>
      <DateField value={value} onChange={onChange} />
    </div>
  )
}

function TotalPreview({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-teal-50 px-4 py-3 text-center dark:bg-teal-950/40">
      <p className="text-xs font-medium text-teal-700 dark:text-teal-400">{label}</p>
      <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{formatQty(value)} kg</p>
    </div>
  )
}

export function EditProductionForm({ row, onChange }: EditFormProps<ProductionRecordRow>) {
  const { data: pipeProducts } = usePipeProducts()
  const [entryDate, setEntryDate] = useState(row.entry_date)
  const [productId, setProductId] = useState(row.pipe_product_id)
  const [quantity, setQuantity] = useState(String(row.quantity))
  const [notes, setNotes] = useState(row.notes ?? '')

  function emit(next: { entryDate?: string; productId?: string; quantity?: string; notes?: string }) {
    const date = next.entryDate ?? entryDate
    const pipe = next.productId ?? productId
    const qty = Number(next.quantity ?? quantity)
    const note = next.notes ?? notes
    onChange(
      qty > 0 && pipe
        ? { entry_date: date, pipe_product_id: pipe, quantity: qty, notes: note.trim() || null }
        : null,
    )
  }

  return (
    <FormShell>
      <DateRow
        value={entryDate}
        onChange={(v) => {
          setEntryDate(v)
          emit({ entryDate: v })
        }}
      />
      <PipeProductPicker
        pipeProducts={pipeProducts ?? []}
        value={productId}
        onChange={(v) => {
          setProductId(v)
          emit({ productId: v })
        }}
      />
      <Field
        label="Quantity (pcs)"
        type="number"
        min="0"
        inputMode="numeric"
        value={quantity}
        onChange={(e) => {
          setQuantity(e.target.value)
          emit({ quantity: e.target.value })
        }}
      />
      <Field
        label="Notes (optional)"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)
          emit({ notes: e.target.value })
        }}
      />
    </FormShell>
  )
}

export function EditSaleForm({ row, onChange }: EditFormProps<SaleRecordRow>) {
  const { data: pipeProducts } = usePipeProducts()
  const [entryDate, setEntryDate] = useState(row.entry_date)
  const [customerId, setCustomerId] = useState(row.customer_id ?? '')
  const [productId, setProductId] = useState(row.pipe_product_id)
  const [quantity, setQuantity] = useState(String(row.quantity))
  const [notes, setNotes] = useState(row.notes ?? '')

  function emit(next: {
    entryDate?: string
    customerId?: string
    productId?: string
    quantity?: string
    notes?: string
  }) {
    const date = next.entryDate ?? entryDate
    const customer = next.customerId ?? customerId
    const pipe = next.productId ?? productId
    const qty = Number(next.quantity ?? quantity)
    const note = next.notes ?? notes
    onChange(
      qty > 0 && pipe && customer
        ? {
            entry_date: date,
            customer_id: customer,
            pipe_product_id: pipe,
            quantity: qty,
            notes: note.trim() || null,
          }
        : null,
    )
  }

  return (
    <FormShell>
      <DateRow
        value={entryDate}
        onChange={(v) => {
          setEntryDate(v)
          emit({ entryDate: v })
        }}
      />
      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Customer
        </span>
        <CustomerPicker
          value={customerId || null}
          onChange={(v) => {
            setCustomerId(v)
            emit({ customerId: v })
          }}
        />
      </div>
      <PipeProductPicker
        pipeProducts={pipeProducts ?? []}
        value={productId}
        onChange={(v) => {
          setProductId(v)
          emit({ productId: v })
        }}
      />
      <Field
        label="Quantity (pcs)"
        type="number"
        min="0"
        inputMode="numeric"
        value={quantity}
        onChange={(e) => {
          setQuantity(e.target.value)
          emit({ quantity: e.target.value })
        }}
      />
      <Field
        label="Notes (optional)"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)
          emit({ notes: e.target.value })
        }}
      />
    </FormShell>
  )
}

export function EditRecyclingForm({ row, onChange }: EditFormProps<RecyclingRecordRow>) {
  const { data: scrapTypes } = useScrapTypes()

  const [entryDate, setEntryDate] = useState(row.entry_date)
  const [sourceScrapTypeId, setSourceScrapTypeId] = useState(row.source_scrap_type_id)
  const [output, setOutput] = useState<GranuleOutput>({
    mode: row.output_entry_mode === 'direct_kg' ? 'direct_kg' : 'bag',
    packKg: row.output_pack_kg ?? 25,
    numBags: row.num_bags === null ? '' : String(row.num_bags),
    directKg: row.output_entry_mode === 'direct_kg' ? String(row.total_output_kg ?? '') : '',
  })
  const [notes, setNotes] = useState(row.notes ?? '')

  const selectableScrapTypes = (scrapTypes ?? []).filter(
    (t) => t.is_active || t.id === sourceScrapTypeId,
  )

  function emit(next: {
    entryDate?: string
    sourceScrapTypeId?: string
    output?: GranuleOutput
    notes?: string
  }) {
    const date = next.entryDate ?? entryDate
    const src = next.sourceScrapTypeId ?? sourceScrapTypeId
    const out = next.output ?? output
    const producedValue = granuleTotalKg(out)
    const note = next.notes ?? notes

    if (!src) {
      onChange(null)
      return
    }

    const outputValid =
      out.mode === 'bag' ? Boolean(out.packKg) && Number(out.numBags) > 0 : producedValue > 0
    onChange(
      outputValid
        ? {
            entry_date: date,
            source_scrap_type_id: src,
            output_mode: 'granules',
            output_entry_mode: out.mode,
            output_pack_kg: out.mode === 'bag' ? out.packKg : null,
            num_bags: out.mode === 'bag' ? Number(out.numBags) : null,
            total_output_kg: producedValue,
            pipe_product_id: null,
            pipe_quantity: null,
            notes: note.trim() || null,
          }
        : null,
    )
  }

  return (
    <FormShell>
      <DateRow
        value={entryDate}
        onChange={(v) => {
          setEntryDate(v)
          emit({ entryDate: v })
        }}
      />
      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Source Material
        </span>
        <div className="flex flex-wrap gap-2">
          {selectableScrapTypes.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              selected={sourceScrapTypeId === t.id}
              onClick={() => {
                setSourceScrapTypeId(t.id)
                emit({ sourceScrapTypeId: t.id })
              }}
            />
          ))}
        </div>
      </div>
      <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Granule Output
        </span>
        <div className="mt-2">
          <GranuleOutputField
            value={output}
            onChange={(v) => {
              setOutput(v)
              emit({ output: v })
            }}
          />
        </div>
      </div>
      <Field
        label="Notes (optional)"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)
          emit({ notes: e.target.value })
        }}
      />
    </FormShell>
  )
}

export function EditRawPurchaseForm({ row, onChange }: EditFormProps<RawPurchaseRecordRow>) {
  const { data: materialTypes } = useRawMaterialTypes()
  const [entryDate, setEntryDate] = useState(row.entry_date)
  const [typeId, setTypeId] = useState(row.raw_material_type_id)
  const [supplier, setSupplier] = useState(row.supplier_name ?? '')
  const [entryMode, setEntryMode] = useState<EntryMode>(row.entry_mode as EntryMode)
  const [packKg, setPackKg] = useState<number | null>(row.pack_kg ?? 25)
  const [numBags, setNumBags] = useState(row.num_bags === null ? '' : String(row.num_bags))
  const [directKg, setDirectKg] = useState(
    row.entry_mode === 'direct_kg' ? String(row.total_qty_kg) : '',
  )
  const [cost, setCost] = useState(row.cost === null ? '' : String(row.cost))
  const [notes, setNotes] = useState(row.notes ?? '')

  const selectableTypes = (materialTypes ?? []).filter((t) => t.is_active || t.id === typeId)
  const total =
    entryMode === 'bag' ? (packKg ?? 0) * Number(numBags || 0) : Number(directKg || 0)

  function emit(next: {
    entryDate?: string
    typeId?: string
    supplier?: string
    entryMode?: EntryMode
    packKg?: number
    numBags?: string
    directKg?: string
    cost?: string
    notes?: string
  }) {
    const date = next.entryDate ?? entryDate
    const material = next.typeId ?? typeId
    const supplierName = next.supplier ?? supplier
    const mode = next.entryMode ?? entryMode
    const pack = next.packKg ?? packKg
    const bags = next.numBags ?? numBags
    const direct = next.directKg ?? directKg
    const costText = next.cost ?? cost
    const note = next.notes ?? notes

    const totalQty = mode === 'bag' ? (pack ?? 0) * Number(bags || 0) : Number(direct || 0)
    onChange(
      material && totalQty > 0
        ? {
            entry_date: date,
            raw_material_type_id: material,
            supplier_name: supplierName.trim() || null,
            entry_mode: mode,
            pack_kg: mode === 'bag' ? pack : null,
            num_bags: mode === 'bag' ? Number(bags) : null,
            total_qty_kg: totalQty,
            cost: costText ? Number(costText) : null,
            notes: note.trim() || null,
          }
        : null,
    )
  }

  return (
    <FormShell>
      <DateRow
        value={entryDate}
        onChange={(v) => {
          setEntryDate(v)
          emit({ entryDate: v })
        }}
      />
      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Material Type
        </span>
        <div className="flex flex-wrap gap-2">
          {selectableTypes.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              selected={typeId === t.id}
              onClick={() => {
                setTypeId(t.id)
                emit({ typeId: t.id })
              }}
            />
          ))}
        </div>
      </div>
      <Field
        label="Supplier (optional)"
        value={supplier}
        onChange={(e) => {
          setSupplier(e.target.value)
          emit({ supplier: e.target.value })
        }}
      />
      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Entry Mode
        </span>
        <div className="flex flex-wrap gap-2">
          <Chip
            label="By Bags"
            selected={entryMode === 'bag'}
            onClick={() => {
              setEntryMode('bag')
              emit({ entryMode: 'bag' })
            }}
          />
          <Chip
            label="Direct Total"
            selected={entryMode === 'direct_kg'}
            onClick={() => {
              setEntryMode('direct_kg')
              emit({ entryMode: 'direct_kg' })
            }}
          />
        </div>
      </div>
      {entryMode === 'bag' ? (
        <>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Pack Size
            </span>
            <PackSizeField
              value={packKg}
              onChange={(v) => {
                setPackKg(v)
                emit({ packKg: v })
              }}
            />
          </div>
          <Field
            label="Number of Bags"
            type="number"
            min="0"
            inputMode="numeric"
            value={numBags}
            onChange={(e) => {
              setNumBags(e.target.value)
              emit({ numBags: e.target.value })
            }}
          />
        </>
      ) : (
        <Field
          label="Total Quantity (kg)"
          type="number"
          min="0"
          inputMode="decimal"
          value={directKg}
          onChange={(e) => {
            setDirectKg(e.target.value)
            emit({ directKg: e.target.value })
          }}
        />
      )}
      <TotalPreview label="Total Quantity" value={total} />
      <Field
        label="Cost (optional)"
        type="number"
        min="0"
        inputMode="decimal"
        value={cost}
        onChange={(e) => {
          setCost(e.target.value)
          emit({ cost: e.target.value })
        }}
      />
      <Field
        label="Notes (optional)"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)
          emit({ notes: e.target.value })
        }}
      />
    </FormShell>
  )
}

export function EditScrapPurchaseForm({ row, onChange }: EditFormProps<ScrapPurchaseRecordRow>) {
  const { data: scrapTypes } = useScrapTypes()
  const [entryDate, setEntryDate] = useState(row.entry_date)
  const [dealerId, setDealerId] = useState(row.scrap_dealer_id ?? '')
  const [scrapTypeId, setScrapTypeId] = useState(row.scrap_type_id)
  const [quantity, setQuantity] = useState(String(row.quantity_kg))
  const [cost, setCost] = useState(row.cost === null ? '' : String(row.cost))
  const [notes, setNotes] = useState(row.notes ?? '')

  const selectableScrapTypes = (scrapTypes ?? []).filter((t) => t.is_active || t.id === scrapTypeId)

  function emit(next: {
    entryDate?: string
    dealerId?: string
    scrapTypeId?: string
    quantity?: string
    cost?: string
    notes?: string
  }) {
    const date = next.entryDate ?? entryDate
    const dealer = next.dealerId ?? dealerId
    const scrapType = next.scrapTypeId ?? scrapTypeId
    const qty = Number(next.quantity ?? quantity)
    const costText = next.cost ?? cost
    const note = next.notes ?? notes
    onChange(
      dealer && scrapType && qty > 0
        ? {
            entry_date: date,
            scrap_dealer_id: dealer,
            scrap_type_id: scrapType,
            quantity_kg: qty,
            cost: costText ? Number(costText) : null,
            notes: note.trim() || null,
          }
        : null,
    )
  }

  return (
    <FormShell>
      <DateRow
        value={entryDate}
        onChange={(v) => {
          setEntryDate(v)
          emit({ entryDate: v })
        }}
      />
      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Scrap Dealer
        </span>
        <ScrapDealerPicker
          value={dealerId || null}
          onChange={(v) => {
            setDealerId(v)
            emit({ dealerId: v })
          }}
        />
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Scrap Type
        </span>
        <div className="flex flex-wrap gap-2">
          {selectableScrapTypes.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              selected={scrapTypeId === t.id}
              onClick={() => {
                setScrapTypeId(t.id)
                emit({ scrapTypeId: t.id })
              }}
            />
          ))}
        </div>
      </div>
      <Field
        label="Quantity (kg)"
        type="number"
        min="0"
        inputMode="decimal"
        value={quantity}
        onChange={(e) => {
          setQuantity(e.target.value)
          emit({ quantity: e.target.value })
        }}
      />
      <Field
        label="Cost (optional)"
        type="number"
        min="0"
        inputMode="decimal"
        value={cost}
        onChange={(e) => {
          setCost(e.target.value)
          emit({ cost: e.target.value })
        }}
      />
      <Field
        label="Notes (optional)"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)
          emit({ notes: e.target.value })
        }}
      />
    </FormShell>
  )
}

export function EditFactoryWasteForm({ row, onChange }: EditFormProps<FactoryWasteRecordRow>) {
  const { data: scrapTypes } = useScrapTypes()
  const [entryDate, setEntryDate] = useState(row.entry_date)
  const [scrapTypeId, setScrapTypeId] = useState(row.scrap_type_id)
  const [quantity, setQuantity] = useState(String(row.quantity_kg))
  const [notes, setNotes] = useState(row.notes ?? '')

  const selectableScrapTypes = (scrapTypes ?? []).filter((t) => t.is_active || t.id === scrapTypeId)

  function emit(next: {
    entryDate?: string
    scrapTypeId?: string
    quantity?: string
    notes?: string
  }) {
    const date = next.entryDate ?? entryDate
    const scrapType = next.scrapTypeId ?? scrapTypeId
    const qty = Number(next.quantity ?? quantity)
    const note = next.notes ?? notes
    onChange(
      scrapType && qty > 0
        ? { entry_date: date, scrap_type_id: scrapType, quantity_kg: qty, notes: note.trim() || null }
        : null,
    )
  }

  return (
    <FormShell>
      <DateRow
        value={entryDate}
        onChange={(v) => {
          setEntryDate(v)
          emit({ entryDate: v })
        }}
      />
      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Scrap Type
        </span>
        <div className="flex flex-wrap gap-2">
          {selectableScrapTypes.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              selected={scrapTypeId === t.id}
              onClick={() => {
                setScrapTypeId(t.id)
                emit({ scrapTypeId: t.id })
              }}
            />
          ))}
        </div>
      </div>
      <Field
        label="Quantity (kg)"
        type="number"
        min="0"
        inputMode="decimal"
        value={quantity}
        onChange={(e) => {
          setQuantity(e.target.value)
          emit({ quantity: e.target.value })
        }}
      />
      <Field
        label="Notes (optional)"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)
          emit({ notes: e.target.value })
        }}
      />
    </FormShell>
  )
}
