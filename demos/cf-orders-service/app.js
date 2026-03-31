'use strict'

/**
 * app.js — order-service demo for SAP BTP Deep Dive, Chapter 03.
 *
 * Shows the binding lifecycle in practice:
 *   1. cf push    → app starts, /health returns "db_not_ready" (no binding yet)
 *   2. cf bind-service order-service orders-db + cf restage
 *                 → VCAP_SERVICES injected, DB connects on startup
 *   3. curl /orders → rows from HANA Cloud
 *
 * Routes:
 *   GET  /        → app identity + DB connection status
 *   GET  /health  → 200 ok / 503 db_not_ready
 *   GET  /orders  → list all orders (JSON)
 *   POST /orders  → insert {product, quantity} → 201 created
 */

const http = require('http')

// Load default-env.json when running locally (no-op in CF where VCAP_SERVICES is injected by the platform)
if (!process.env.VCAP_SERVICES) {
  require('@sap/xsenv').loadEnv()
}

const db = require('./db')

const port = process.env.PORT || 3000

// ── Startup: connect to HANA Cloud ─────────────────────────────────────────

let dbReady = false
let dbError = null

db.connect()
  .then(() => db.ensureTable())
  .then(() => {
    dbReady = true
    console.log('[order-service] DB connected and ORDERS table ready.')
  })
  .catch((err) => {
    dbError = err.message
    console.error('[order-service] DB connection failed:', err.message)
    console.error('[order-service] Continuing without DB — bind the service then restage.')
  })

// ── Helpers ────────────────────────────────────────────────────────────────

function send(res, status, body) {
  const payload = JSON.stringify(body, null, 2)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw)) } catch { resolve({}) }
    })
  })
}

// ── Server ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url    = new URL(req.url, `http://${req.headers.host}`)
  const method = req.method
  const path   = url.pathname

  // GET / — app identity and DB status
  if (method === 'GET' && path === '/') {
    const vcap = process.env.VCAP_APPLICATION
      ? JSON.parse(process.env.VCAP_APPLICATION)
      : null
    const creds = db.parseCredentials()

    return send(res, 200, {
      app:         vcap ? vcap.application_name : 'order-service (local)',
      space:       vcap ? vcap.space_name        : 'local',
      bound_to:    creds ? `${creds.host} (hana-cloud)` : 'not bound — run cf bind-service',
      db_ready:    dbReady,
      db_error:    dbError
    })
  }

  // GET /health — liveness check (used by CF health monitoring)
  if (method === 'GET' && path === '/health') {
    return send(
      res,
      dbReady ? 200 : 503,
      { status: dbReady ? 'ok' : 'db_not_ready', error: dbError }
    )
  }

  // GET /orders — list all orders
  if (method === 'GET' && path === '/orders') {
    if (!dbReady) return send(res, 503, { error: dbError || 'DB not ready' })
    try {
      const orders = await db.listOrders()
      return send(res, 200, { count: orders.length, orders })
    } catch (err) {
      return send(res, 500, { error: err.message })
    }
  }

  // POST /orders — insert a new order
  // Body: { "product": "Avocados", "quantity": 100 }
  if (method === 'POST' && path === '/orders') {
    if (!dbReady) return send(res, 503, { error: dbError || 'DB not ready' })
    const body = await readBody(req)
    if (!body.product || !body.quantity) {
      return send(res, 400, { error: 'Both product and quantity are required.' })
    }
    try {
      await db.insertOrder(String(body.product), parseInt(body.quantity, 10))
      return send(res, 201, {
        created:  true,
        product:  body.product,
        quantity: body.quantity
      })
    } catch (err) {
      return send(res, 500, { error: err.message })
    }
  }

  send(res, 404, { error: `${method} ${path} not found` })
})

server.listen(port, () => {
  console.log(`[order-service] Listening on port ${port}`)
})
