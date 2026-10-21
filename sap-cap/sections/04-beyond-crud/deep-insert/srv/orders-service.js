const cds = require('@sap/cds')

module.exports = class OrdersService
  extends cds.ApplicationService {
  async init() {

    this.before('CREATE', 'Orders', req => {
      if (!req.data.items?.length)
        req.error(400, 'An order needs at least one item')

      for (const item of req.data.items || [])
        if (item.quantity <= 0)
          req.error(400, `Item ${item.product} needs a positive quantity`)
    })

    return super.init()
  }
}
