using { orders.app as db } from '../db/schema';

@path     : '/orders'
@requires : ['SalesRep', 'Manager']
service OrderService {

  @odata.draft.enabled
  @restrict: [
    { grant: ['READ', 'WRITE'], to: 'SalesRep' },
    { grant: 'READ',            to: 'Manager'  }
  ]
  entity Orders as projection on db.Orders
    actions {
      @requires: 'SalesRep'
      action submit();

      @requires: 'Manager'
      action approve();

      @requires: 'Manager'
      action reject(note : String(500)) returns Orders;
    };

  @readonly entity BusinessPartners as projection on db.BusinessPartners;
  @readonly entity Products         as projection on db.Products;
  @readonly entity OrderItems       as projection on db.OrderItems;
}
