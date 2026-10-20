const cds = require('@sap/cds')

module.exports = class OrdersService extends cds.ApplicationService {
  async init() {

    this.before('CREATE', 'Orders', (req) => {
      if (!req.data.customerId)

        req.error(400, 'Customer is required')

      if (!req.data.region)

        req.error(400, 'Region is required')


      if (req.data.quantity > 900)
        req.warn(`Order is nearing its limit`)

    })

    // Warn after reads when any order is approaching the quantity limit
    this.after('READ', 'Orders', (orders, req) => {
      for (const order of orders) {
        if (order.quantity > 900)
          req.warn(`Order ${order.ID} is nearing its limit`)
      }
    })

    return super.init()
  }
}
