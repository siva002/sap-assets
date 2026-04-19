const express = require('express')
const app = express()

const orders = [
  { id: 'ORD-001', customer: 'Acme Corp',   amount: 1200, currency: 'EUR', status: 'delivered' },
  { id: 'ORD-002', customer: 'FreshFoods',  amount:  850, currency: 'EUR', status: 'processing' },
  { id: 'ORD-003', customer: 'GlobalTech',  amount: 3400, currency: 'EUR', status: 'pending' },
]

app.get('/orders', (req, res) => {
  console.log(`[fake-s4] GET /orders — returning ${orders.length} orders`)
  res.json(orders)
})

app.get('/orders/:id', (req, res) => {
  const order = orders.find(o => o.id === req.params.id)
  if (!order) return res.status(404).json({ error: 'Order not found' })
  console.log(`[fake-s4] GET /orders/${req.params.id}`)
  res.json(order)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`[fake-s4] Fake S/4HANA running on :${PORT}`)
  console.log(`[fake-s4] Try: curl http://localhost:${PORT}/orders`)
})
