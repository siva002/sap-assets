namespace orders.app;
using { managed, cuid } from '@sap/cds/common';

entity BusinessPartners : cuid {
  name         : String(100);
  country      : String(3);
  city         : String(80);
  industry     : String(50);
  contactName  : String(100);
  contactEmail : String(100);
}

entity Products : cuid {
  name        : String(100);
  category    : String(50);
  unitPrice   : Decimal(10,2);
  currency    : String(3)   default 'USD';
  unit        : String(20);
  description : String(250);
}

type OrderStatus : String enum {
  Draft     = 'Draft';
  Submitted = 'Submitted';
  Approved  = 'Approved';
  Rejected  = 'Rejected';
  Fulfilled = 'Fulfilled';
}

entity Orders : cuid, managed {
  orderNumber   : String(20);
  buyer         : Association to BusinessPartners;
  salesRep      : String(100);
  status        : OrderStatus default 'Draft';
  notes         : String(500);
  rejectionNote : String(500);
  currency      : String(3)   default 'USD';
  totalAmount   : Decimal(12,2);
  items         : Composition of many OrderItems on items.order = $self;
  virtual statusCriticality : Integer;
}

entity OrderItems : cuid {
  order     : Association to Orders;
  product   : Association to Products;
  quantity  : Integer;
  unitPrice : Decimal(10,2);
  netAmount : Decimal(12,2);
}
