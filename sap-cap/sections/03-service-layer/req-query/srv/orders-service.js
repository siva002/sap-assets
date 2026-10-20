const cds = require('@sap/cds')

module.exports = class OrdersService extends cds.ApplicationService {
  async init() {

    this.before('READ', 'BusinessPartners', req => {
        const { limit, orderBy } = req.query.SELECT
    })

    return super.init()
  }
}
