const cds = require('@sap/cds')

module.exports = class OrderService extends cds.ApplicationService {
  async init() {
    const { Orders, OrderItems } = this.entities

    // ── Status transitions ─────────────────────────────────────────────────────

    this.on('submit', Orders, async req => {
      const { ID } = req.params[0]
      const order = await SELECT.one(Orders, ID)
      if (!order) return req.reject(404, `Order not found`)
      if (order.status !== 'Draft')
        return req.reject(409, `Only Draft orders can be submitted — current status: ${order.status}`)
      await UPDATE(Orders, ID).with({ status: 'Submitted' })
      return SELECT.one(Orders, ID)
    })

    this.on('approve', Orders, async req => {
      const { ID } = req.params[0]
      const order = await SELECT.one(Orders, ID)
      if (!order) return req.reject(404, `Order not found`)
      if (order.status !== 'Submitted')
        return req.reject(409, `Only Submitted orders can be approved — current status: ${order.status}`)
      await UPDATE(Orders, ID).with({ status: 'Approved' })
      return SELECT.one(Orders, ID)
    })

    this.on('reject', Orders, async req => {
      const { ID } = req.params[0]
      const { note } = req.data
      if (!note?.trim()) return req.reject(400, 'Rejection note is required')
      const order = await SELECT.one(Orders, ID)
      if (!order) return req.reject(404, `Order not found`)
      if (order.status !== 'Submitted')
        return req.reject(409, `Only Submitted orders can be rejected — current status: ${order.status}`)
      await UPDATE(Orders, ID).with({ status: 'Rejected', rejectionNote: note })
      return SELECT.one(Orders, ID)
    })

    // ── Computed fields ────────────────────────────────────────────────────────

    this.after('READ', 'Orders', results => {
      const map = { Draft: 0, Submitted: 2, Approved: 3, Rejected: 1, Fulfilled: 3 }
      for (const order of [].concat(results ?? [])) {
        if (order) order.statusCriticality = map[order.status] ?? 0
      }
    })

    // ── Recalculate total when items change ────────────────────────────────────

    const recalcTotal = async orderID => {
      const row = await SELECT.one`sum(netAmount) as total`.from(OrderItems).where({ order_ID: orderID })
      await UPDATE(Orders, orderID).with({ totalAmount: row?.total ?? 0 })
    }

    this.after(['CREATE', 'UPDATE', 'DELETE'], 'OrderItems', async (_, req) => {
      const orderID = req.data?.order_ID ?? req.query?.where?.order_ID
      if (orderID) await recalcTotal(orderID)
    })

    await super.init()
  }
}
