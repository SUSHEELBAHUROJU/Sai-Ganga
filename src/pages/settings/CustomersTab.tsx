import { ContactListTab } from './ContactListTab'
import { useCustomers, useAddCustomer, useUpdateCustomer, useSetCustomerActive } from '../../hooks/useCustomers'

export function CustomersTab() {
  return (
    <ContactListTab
      entityLabel="Customer"
      useList={useCustomers}
      useAdd={useAddCustomer}
      useUpdate={useUpdateCustomer}
      useSetActive={useSetCustomerActive}
    />
  )
}
