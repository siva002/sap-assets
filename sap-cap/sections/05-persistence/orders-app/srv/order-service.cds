using { orders.app as db } from '../db/schema';

@path: '/orders'
service OrderService {

  @odata.draft.enabled
  entity Orders as projection on db.Orders
    actions {
      action submit();
      action approve();
      action reject(note : String(500)) returns Orders;
    };

  @readonly entity BusinessPartners as projection on db.BusinessPartners;
  @readonly entity Products         as projection on db.Products;
  @readonly entity OrderItems       as projection on db.OrderItems;
}
