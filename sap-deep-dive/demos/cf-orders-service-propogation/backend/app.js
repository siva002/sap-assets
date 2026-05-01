'use strict'

/**
 * app.js — orders-service-propogation backend for SAP BTP Deep Dive, Section 06 Chapter 07.
 *
 * Extends cf-orders-service-secure with principal propagation to HANA Cloud.
 *
 * The key difference from the secure demo:
 *   In the secure demo, the backend connects to HANA once at startup using a
 *   service account (technical identity). Every user's query runs under that
 *   service account — HANA cannot apply row-level security.
 *
 *   In this demo, the backend performs an On-Behalf-Of (OBO) token exchange for
 *   every request. XSUAA issues a new JWT scoped for HANA, carrying the real
 *   user's identity. HANA connects under that user — CURRENT_USER = alice@corp.com.
 *   Row-level security works. Audit logs record the real user.
 *
 * Security flow:
 *   1. App Router authenticates the user and forwards the JWT as Bearer.
 *   2. Passport / xssec validates the JWT → req.authInfo populated.
 *   3. checkScope() enforces the required scope for each route.
 *   4. req.authInfo.requestTokenForClient(hana, null) exchanges the user's JWT
 *      for a new JWT scoped for the HANA service (OBO grant).
 *   5. db.queryAsUser(hana, userToken, ...) opens a per-request HANA connection
 *      authenticated as the real user, runs the query, and closes it.
 *
 * Routes:
 *   GET  /health  → 200 ok (shows logged-in user + propagation mode)
 *   GET  /orders  → list orders visible to this user (requires orders.read)
 *   POST /orders  → insert order as this user (requires orders.create)
 *   GET  /token   → returns the raw JWT for inspection at jwt.io
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

// ── Service bindings ──────────────────────────────────────────────────────────
// Both XSUAA and HANA bindings are parsed at startup.
// XSUAA is used for JWT validation + OBO token exchange.
// HANA credentials are passed to requestTokenForClient() so XSUAA knows
// which service the new token is intended for (sets the aud claim).

const { xsuaa, hana } = xsenv.getServices({
  xsuaa: { tag: 'xsuaa' },
  hana:  { tag: 'hana'  }
})

// ── Security middleware ───────────────────────────────────────────────────────

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

// ── Principal propagation helper ──────────────────────────────────────────────
// Exchanges the user's JWT for a new token scoped for the HANA service.
// XSUAA validates the user JWT + the backend's client credentials, then
// issues a new JWT with:
//   sub / email: the real user (alice@corp.com)
//   aud:         the HANA service's clientid
// This token is then used to open a HANA connection — HANA sets
// CURRENT_USER to alice, enabling row-level security and correct audit logs.

async function getHanaToken(req) {
  return req.authInfo.requestTokenForClient(hana, null)
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /token — inspect the raw user JWT at jwt.io
app.get('/token', (req, res) => {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  res.json({ token: raw })
})

// GET /health — shows the logged-in user and confirms propagation mode
app.get('/health', (req, res) => {
  res.json({
    status:            'ok',
    user:              req.authInfo.getEmail(),
    propagation:       true,
    note:              'Each /orders request opens a HANA connection as the authenticated user.'
  })
})

// GET /orders — list orders visible to this user (requires orders.read)
// The OBO exchange happens here — HANA sees alice, not the service account.
app.get('/orders', checkScope('orders.read'), async (req, res) => {
  try {
    const userToken = await getHanaToken(req)
    const orders    = await db.listOrdersAsUser(hana, userToken)
    res.json({
      count:       orders.length,
      orders,
      user:        req.authInfo.getEmail(),
      propagated:  true   // HANA CURRENT_USER = this user
    })
  } catch (err) {
    console.error('[propogation] GET /orders error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /orders — create an order as this user (requires orders.create)
app.post('/orders', checkScope('orders.create'), async (req, res) => {
  const { product, quantity } = req.body
  if (!product || !quantity) {
    return res.status(400).json({ error: 'Both product and quantity are required.' })
  }
  try {
    const userToken = await getHanaToken(req)
    await db.insertOrderAsUser(hana, userToken, String(product), parseInt(quantity, 10))
    res.status(201).json({
      created:    true,
      product,
      quantity,
      user:       req.authInfo.getEmail(),
      propagated: true
    })
  } catch (err) {
    console.error('[propogation] POST /orders error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`[orders-propogation] Listening on port ${port}`)
  console.log('[orders-propogation] Principal propagation enabled — each request connects to HANA as the authenticated user.')
})
