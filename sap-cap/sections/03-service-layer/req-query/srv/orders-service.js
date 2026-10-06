const cds = require('@sap/cds')

module.exports = class OrdersService extends cds.ApplicationService {
  async init() {

    this.before('READ', 'BusinessPartners', req => {
      console.log('[req.query] before:', req.query.SELECT.columns)
    })

    return super.init()
  }
}
