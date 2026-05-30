using { orders.app as my } from '../db/schema';

service OrdersService {
  entity BusinessPartners as projection on my.BusinessPartners;
  entity Products         as projection on my.Products;
  @cds.redirection.target
  entity Orders           as projection on my.Orders;
  entity OrderItems       as projection on my.OrderItems;

  entity OrderSummary as projection on my.Orders {
    ID,
    orderNumber,
    status,
    totalAmount,
    buyer.name    as buyerName,
    buyer.city    as buyerCity,
    buyer.country as buyerCountry
  };
}
