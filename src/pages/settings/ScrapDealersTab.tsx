import { ContactListTab } from './ContactListTab'
import {
  useScrapDealers,
  useAddScrapDealer,
  useUpdateScrapDealer,
  useSetScrapDealerActive,
} from '../../hooks/useScrapDealers'

export function ScrapDealersTab() {
  return (
    <ContactListTab
      entityLabel="Scrap Dealer"
      useList={useScrapDealers}
      useAdd={useAddScrapDealer}
      useUpdate={useUpdateScrapDealer}
      useSetActive={useSetScrapDealerActive}
    />
  )
}
