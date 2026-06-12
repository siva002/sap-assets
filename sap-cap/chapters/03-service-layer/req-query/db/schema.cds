namespace orders.app;
using { cuid } from '@sap/cds/common';

entity BusinessPartners : cuid {
  name    : String(100);
  city    : String(100);
  country : String(3);
  industry: String(50);
}
