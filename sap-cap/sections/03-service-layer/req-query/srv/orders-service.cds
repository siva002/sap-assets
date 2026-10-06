using { orders.app as my } from '../db/schema';

service OrdersService {
  entity BusinessPartners as projection on my.BusinessPartners;
}
