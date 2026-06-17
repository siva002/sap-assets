using { orders.app as my } from '../db/schema';

service OrdersService {
  entity Orders as projection on my.Orders;
}
