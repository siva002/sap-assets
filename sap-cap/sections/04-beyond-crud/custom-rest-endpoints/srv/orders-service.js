const cds = require('@sap/cds')
const express = require('express')

module.exports = class OrdersService
  extends cds.ApplicationService {
  async init() {
    const { Orders } = this.entities

    cds.app.post('/webhooks/payment-confirmed', express.json(), async (req, res) => {
      const { orderId } = req.body.data.object.metadata
      const order = await SELECT.one.from(Orders, orderId)
      console.log(`Payment confirmed for order ${order.ID} — ${order.customerId}`)
      res.sendStatus(200)
    })
    cds.app.get('/ping', (req, res) => res.send('OK'))

    return super.init()
  }
}
