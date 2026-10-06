const cds = require('@sap/cds')

module.exports = class OrdersService extends cds.ApplicationService {
  async init() {

    this.before('CREATE', 'BusinessPartners', req => {    
      req.data.name = req.data.name.trim().toUpperCase()

      req.data.country = req.data.country.trim().toUpperCase()

      req.data.createdBy = req.user.id
    })

    return super.init()
  }
} 
