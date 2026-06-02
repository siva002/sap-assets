namespace orders.app;
using {  cuid, managed } from '@sap/cds/common';

aspect HasContact {
  contactName  : String(100);
  contactEmail : String(100);
}

type ISOCode : String(3);

entity BusinessPartners : cuid , managed , HasContact {
  name         : String(100);
  country      : ISOCode;
  city         : String(80);
  industry     : String(50);
}