'use strict'

/**
 * app.js — orders-service-secure backend for SAP BTP Deep Dive, Section 06 Chapter 02.
 *
 * Extends cf-orders-service with JWT-based security using XSUAA + @sap/xssec.
 *
 * Security flow:
 *   1. Every request must carry a valid JWT in the Authorization header.
 *   2. passport + JWTStrategy validates the token signature against the XSUAA
 *      public key. Invalid or missing token → 401.
 *   3. Per-route scope checks enforce fine-grained permissions:
 *        GET  /orders  → requires orders.read scope
 *        POST /orders  → requires orders.create scope
 *      Missing scope on a valid token → 403.
 *
 * In the deployed flow the App Router attaches the token before forwarding —
 * the backend never needs to handle login or redirects.
 *
 * Routes:
 *   GET  /health  → 200 ok / 503 db_not_ready (shows logged-in user email)
 *   GET  /orders  → list all orders (requires orders.read)
 *   POST /orders  → insert order (requires orders.create)
 */

const express      = require('express')
const passport     = require('passport')
const { XsuaaService, XssecPassportStrategy } = require('@sap/xssec')
const xsenv        = require('@sap/xsenv')

// Load default-env.json when running locally (no-op in CF)
if (!process.env.VCAP_SERVICES) {
  xsenv.loadEnv()
}

const db   = require('./db')
const app  = express()
const port = process.env.PORT || 3000

// ── Security middleware ───────────────────────────────────────────────────────
// xssec v4 uses XssecPassportStrategy (renamed from JWTStrategy).
// Validates every incoming JWT against the bound XSUAA instance.
// Missing or invalid token → 401. On success, attaches security context to req.authInfo.

const { xsuaa } = xsenv.getServices({ xsuaa: { tag: 'xsuaa' } })
const xsuaaService = new XsuaaService(xsuaa)
passport.use('JWT', new XssecPassportStrategy(xsuaaService))
app.use(passport.initialize())
app.use(passport.authenticate('JWT', { session: false }))
app.use(express.json())

// ── Scope guard ───────────────────────────────────────────────────────────────
// checkScope('orders.read') returns middleware that rejects the request with 403
// if the token's scopes array does not contain <xsappname>.orders.read.
// checkLocalScope strips the xsappname prefix so you only pass the short name.

function checkScope(scope) {
  return (req, res, next) => {
    if (!req.authInfo.checkLocalScope(scope)) {
      return res.status(403).json({
        error:    'Forbidden',
        message:  `Missing required scope: ${scope}`,
        user:     req.authInfo.getEmail()
      })
    }
    next()
  }
}

// ── DB startup ────────────────────────────────────────────────────────────────

let dbReady = false
let dbError = null

db.connect()
  .then(() => db.ensureTable())
  .then(() => {
    dbReady = true
    console.log('[orders-secure] DB connected and ORDERS table ready.')
  })
  .catch((err) => {
    dbError = err.message
    console.error('[orders-secure] DB connection failed:', err.message)
    console.error('[orders-secure] Bind the HANA service then restage.')
  })

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /token — returns the raw JWT so you can paste it into jwt.io
// The token is extracted from the Authorization: Bearer header forwarded by the App Router.
// This endpoint is protected by the same global JWT middleware — no valid token, no response.
app.get('/token', (req, res) => {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  res.json({ token: raw })
})

// GET /health — liveness check, also shows which user the token belongs to
app.get('/health', (req, res) => {
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? 'ok' : 'db_not_ready',
    error:  dbError  || null,
    user:   req.authInfo.getEmail(),
    scopes: req.authInfo.getGrantType()
  })
})

// GET /orders — list all orders (requires orders.read scope)
app.get('/orders', checkScope('orders.read'), async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: dbError || 'DB not ready' })
  try {
    const orders = await db.listOrders()
    res.json({
      count:  orders.length,
      orders,
      user:   req.authInfo.getEmail()
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /orders — create a new order (requires orders.create scope)
// Body: { "product": "Avocados", "quantity": 100 }
app.post('/orders', checkScope('orders.create'), async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: dbError || 'DB not ready' })
  const { product, quantity } = req.body
  if (!product || !quantity) {
    return res.status(400).json({ error: 'Both product and quantity are required.' })
  }
  try {
    await db.insertOrder(String(product), parseInt(quantity, 10))
    res.status(201).json({
      created:  true,
      product,
      quantity,
      user:     req.authInfo.getEmail()
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`[orders-secure] Listening on port ${port}`)
})
