const cds = require('@sap/cds')

module.exports = class OrdersService extends cds.ApplicationService {
  async init() {

    this.before('CREATE', 'BusinessPartners', req => {
      req.data.name = req.data.name.toUpperCase()
      console.log('[before] Saving:', req.data.name)
    })

    return super.init()
  }
}
