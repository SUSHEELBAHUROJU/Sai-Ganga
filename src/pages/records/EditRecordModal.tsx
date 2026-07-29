import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { useUpdateRecord } from '../../hooks/useRecordMutations'
import { RECORD_KIND_LABEL, type EntryRecord, type RecordKind } from '../../hooks/useRecords'
import { useToast } from '../../lib/toast'
import {
  EditProductionForm,
  EditSaleForm,
  EditRecyclingForm,
  EditRawPurchaseForm,
  EditScrapPurchaseForm,
  EditFactoryWasteForm,
} from './editForms'

type EditRecordModalProps = {
  record: EntryRecord | null
  onClose: () => void
}

/**
 * Editing always SETs (overwrites), never adds — but the DB still enforces
 * one row per date+product (date+product+customer for sales), so moving an
 * edited entry onto a day/product that already has one hits the same unique
 * constraint the Add screens merge around. Surface that plainly instead of a
 * raw DB error: the fix is to edit the other entry, not retry this save.
 */
function editErrorMessage(kind: RecordKind, error: unknown): string {
  const code = (error as { code?: string } | null | undefined)?.code
  if (code === '23505') {
    return kind === 'production'
      ? 'An entry already exists for that date and product — edit that entry instead.'
      : kind === 'sale'
        ? 'An entry already exists for that date, product and customer — edit that entry instead.'
        : 'An entry already exists for that combination — edit that entry instead.'
  }
  return 'Could not update entry'
}

export function EditRecordModal({ record, onClose }: EditRecordModalProps) {
  const updateRecord = useUpdateRecord()
  const { showToast } = useToast()
  const [patch, setPatch] = useState<Record<string, unknown> | null>(null)

  if (!record) return null

  function renderForm(current: EntryRecord) {
    switch (current.kind) {
      case 'production':
        return <EditProductionForm row={current.row} onChange={setPatch} />
      case 'sale':
        return <EditSaleForm row={current.row} onChange={setPatch} />
      case 'recycling':
        return <EditRecyclingForm row={current.row} onChange={setPatch} />
      case 'raw_material_purchase':
        return <EditRawPurchaseForm row={current.row} onChange={setPatch} />
      case 'scrap_purchase':
        return <EditScrapPurchaseForm row={current.row} onChange={setPatch} />
      case 'factory_waste':
        return <EditFactoryWasteForm row={current.row} onChange={setPatch} />
    }
  }

  function handleSave(current: EntryRecord) {
    if (!patch) {
      showToast('Check the highlighted fields', 'error')
      return
    }
    updateRecord.mutate(
      { kind: current.kind, id: current.row.id, patch },
      {
        onSuccess: () => {
          showToast('Entry updated')
          setPatch(null)
          onClose()
        },
        onError: (error) => showToast(editErrorMessage(current.kind, error), 'error'),
      },
    )
  }

  return (
    <Modal
      title={`Edit ${RECORD_KIND_LABEL[record.kind]}`}
      open
      onClose={() => {
        setPatch(null)
        onClose()
      }}
    >
      {/* Keyed by row id so opening a different record of the same kind
          remounts the form instead of reusing the previous row's state. */}
      <div key={record.row.id}>{renderForm(record)}</div>
      <button
        type="button"
        onClick={() => handleSave(record)}
        disabled={updateRecord.isPending || !patch}
        className="mt-5 w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
      >
        {updateRecord.isPending ? 'Saving…' : 'Save Changes'}
      </button>
    </Modal>
  )
}
