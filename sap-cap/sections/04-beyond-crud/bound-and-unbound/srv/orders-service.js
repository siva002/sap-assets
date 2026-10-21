const cds = require('@sap/cds')

module.exports = class OrdersService
  extends cds.ApplicationService {
  async init() {
    const { Orders } = this.entities

    this.on('duplicate', 'Orders', async req => {
      const { ID } = req.params[0]
      const { quantityOverride } = req.data
      const order = await SELECT.one.from(Orders, ID)
      const { customerId, region, quantity } = order
      const copy = {
        customerId, region,
        quantity: quantityOverride ?? quantity
      }
      await INSERT.into(Orders).entries(copy)
      return copy
    })

    this.on('orderCount', async () => {
      const orders = await SELECT.from(Orders)
      return orders.length
    })

    return super.init()
  }
}
