const cds = require('@sap/cds')

module.exports = class OrdersService extends cds.ApplicationService {
  async init() {

    // Validate all required fields before writing — collect every failure at once
    this.before('CREATE', 'Orders', req => {
      const { customerId, quantity, region } = req.data

      if (!customerId)
        req.error(400, 'Customer is required', 'customerId')
      if (quantity == null || quantity <= 0)
        req.error(400, 'Quantity must be a positive number', 'quantity')
      if (!region)
        req.error(400, 'Region is required', 'region')
    })

    // Warn after reads when any order is approaching the quantity limit
    this.after('READ', 'Orders', (orders, req) => {
      for (const order of orders) {
        if (order.quantity > 900)
          req.warn(`Order ${order.ID} has quantity ${order.quantity} — approaching the limit of 1000`)
      }
    })

    return super.init()
  }
}
