import { ContactListTab } from './ContactListTab'
import {
  useSuppliers,
  useAddSupplier,
  useUpdateSupplier,
  useSetSupplierActive,
} from '../../hooks/useSuppliers'

export function SuppliersTab() {
  return (
    <ContactListTab
      entityLabel="Supplier"
      useList={useSuppliers}
      useAdd={useAddSupplier}
      useUpdate={useUpdateSupplier}
      useSetActive={useSetSupplierActive}
    />
  )
}
