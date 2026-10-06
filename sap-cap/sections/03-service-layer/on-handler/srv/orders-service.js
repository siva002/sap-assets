const cds = require('@sap/cds')
const { SELECT } = cds.ql

module.exports = class OrdersService extends cds.ApplicationService {
  async init() {

    this.on('READ', 'BusinessPartners', async () => {
      // Replaces CAP's default SELECT entirely.
      // Only Manufacturing partners are ever returned,
      // regardless of any $filter the client sends.
      return SELECT.from('BusinessPartners').where({ industry: 'Manufacturing' })
    })

    return super.init()
  }
}
