const cds = require('@sap/cds')

module.exports = class OrdersService extends cds.ApplicationService {
  async init() {

    this.after('CREATE', 'BusinessPartners', result => {
      // Fires after the record is committed to the database.
      // result.ID is the UUID cuid generated during the write.
      console.log('[after] Partner saved:', result.ID, result.name)
    })

    return super.init()
  }
}
