const cds = require('@sap/cds')

module.exports = class OrdersService extends cds.ApplicationService {
  async init() {

    this.before('CREATE', 'BusinessPartners', req => {
      console.log('[req.data] received:', req.data)

      if (!req.data.name || !req.data.country)
        req.reject(400, 'name and country are required')

      req.data.name    = req.data.name.trim().toUpperCase()
      req.data.country = req.data.country.trim().toUpperCase()
      req.data.createdBy = req.user.id

      console.log('[req.data] writing: ', req.data)
    })

    return super.init()
  }
}
