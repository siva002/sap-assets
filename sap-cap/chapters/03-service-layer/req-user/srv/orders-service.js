const cds = require('@sap/cds')

module.exports = class OrdersService extends cds.ApplicationService {
  async init() {

    this.before('CREATE', 'BusinessPartners', req => {
      console.log('[req.user] id    :', req.user.id)
      console.log('[req.user] locale:', req.user.locale)

      if (!req.user.is('approver') && req.data.industry === 'Defense')
        req.reject(403, `Role 'approver' required for Defense industry`)

      req.data.createdBy = req.user.id
    })

    return super.init()
  }
}
