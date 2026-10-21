namespace orders.app;
using { cuid } from '@sap/cds/common';

entity Orders : cuid {
  customerId : String(100);
  region     : String(50);
  quantity   : Integer;
  items      : Composition of many OrderItems
                 on items.order = $self;
}

entity OrderItems : cuid {
  order    : Association to Orders;
  product  : String(100);
  quantity : Integer;
}
