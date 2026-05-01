'use strict'

/**
 * user-data-service — downstream microservice for the propagation v2 demo.
 *
 * This service is the target that proves principal propagation works.
 * It is bound to the same XSUAA instance as orders-backend.
 * When orders-backend calls this service it forwards the user's JWT as Bearer.
 * This service validates the JWT and sees the real user — alice@corp.com.
 *
 * The in-memory store is keyed by user email.
 * Each user can only see and create their own orders.
 * Two different users logged in at the same time will get completely different data.
 * That is the proof that the identity traveled across the service boundary.
 *
 * Routes:
 *   GET  /health  → 200 { user, note }
 *   GET  /orders  → { user, orders }   requires orders.read
 *   POST /orders  → 201 { created, user, order }  requires orders.create
 */

const express  = require('express')
const passport = require('passport')
const { XsuaaService, XssecPassportStrategy } = require('@sap/xssec')
const xsenv    = require('@sap/xsenv')

if (!process.env.VCAP_SERVICES) xsenv.loadEnv()

const app  = express()
const port = process.env.PORT || 3001

// ── XSUAA setup ───────────────────────────────────────────────────────────────
const { xsuaa } = xsenv.getServices({ xsuaa: { tag: 'xsuaa' } })
const xsuaaService = new XsuaaService(xsuaa)
passport.use('JWT', new XssecPassportStrategy(xsuaaService))
app.use(passport.initialize())
app.use(passport.authenticate('JWT', { session: false }))
app.use(express.json())

// ── Scope guard ───────────────────────────────────────────────────────────────
function checkScope(scope) {
  return (req, res, next) => {
    if (!req.authInfo.checkLocalScope(scope)) {
      return res.status(403).json({
        error:   'Forbidden',
        message: `Missing required scope: ${scope}`,
        user:    req.authInfo.getEmail()
      })
    }
    next()
  }
}

// ── In-memory store (keyed by user email) ─────────────────────────────────────
// In a real service this would be a database.
// For the demo, per-user data persists as long as the app is running.
const store = {}

function getOrders(email) {
  return store[email] || []
}

function addOrder(email, product, quantity) {
  if (!store[email]) store[email] = []
  const order = {
    order_id:   store[email].length + 1,
    product,
    quantity,
    created_by: email,          // set from the authenticated identity
    created_at: new Date().toISOString()
  }
  store[email].push(order)
  return order
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /health — confirms this service validated the JWT and knows the caller
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'user-data-service',
    authenticated_as: req.authInfo.getEmail(),
    note: 'Identity was propagated from orders-backend via JWT forwarding'
  })
})

// GET /orders — returns only this user's orders
// The store key is the email from the validated JWT — not from a query param.
// There is no way for orders-backend to request another user's data.
app.get('/orders', checkScope('orders.read'), (req, res) => {
  const email = req.authInfo.getEmail()
  res.json({
    service:  'user-data-service',
    user:     email,
    orders:   getOrders(email),
    note:     `Only showing orders created by ${email}`
  })
})

// POST /orders — creates an order for this user
app.post('/orders', checkScope('orders.create'), (req, res) => {
  const { product, quantity } = req.body
  if (!product || !quantity) {
    return res.status(400).json({ error: 'product and quantity are required' })
  }
  const email = req.authInfo.getEmail()
  const order = addOrder(email, String(product), parseInt(quantity, 10))
  res.status(201).json({
    service:  'user-data-service',
    created:  true,
    user:     email,
    order
  })
})

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`[user-data-service] Listening on port ${port}`)
  console.log('[user-data-service] Data is scoped per authenticated user identity.')
})
