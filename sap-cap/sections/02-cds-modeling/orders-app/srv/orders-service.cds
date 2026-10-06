using { orders.app as my } from '../db/schema';

service OrdersService {
  entity BusinessPartners as projection on my.BusinessPartners;
  entity Products         as projection on my.Products;
  entity Orders           as projection on my.Orders;
  entity OrderItems       as projection on my.OrderItems;
}
