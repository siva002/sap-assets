namespace orders.app;
using { cuid } from '@sap/cds/common';

entity Orders : cuid {
  customerId : String(100);
  quantity   : Integer;
  region     : String(50);
}
