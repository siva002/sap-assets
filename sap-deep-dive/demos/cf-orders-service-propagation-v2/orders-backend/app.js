'use strict'

/**
 * orders-backend — API gateway for the propagation v2 demo.
 *
 * This service sits between the app router and user-data-service.
 * It validates the incoming JWT (issued by XSUAA for the logged-in user),
 * then forwards that same JWT when calling user-data-service.
 *
 * user-data-service validates the forwarded JWT and sees the real user.
 * This is principal propagation: alice's identity travels from the browser,
 * through orders-backend, into user-data-service — without orders-backend
 * ever impersonating her or using a technical service account.
 *
 * Key: orders-backend forwards req.headers.authorization to user-data-service.
 * user-data-service's passport/xssec validates it against the same XSUAA instance.
 * Both apps are bound to orders-xsuaa-v2 so the JWT is trusted by both.
 *
 * Routes:
 *   GET  /health  → shows this service's view of the user
 *   GET  /orders  → proxies to user-data-service GET /orders (requires orders.read)
 *   POST /orders  → proxies to user-data-service POST /orders (requires orders.create)
 *   GET  /token   → returns raw JWT for inspection at jwt.io
 */

const express  = require('express')
const passport = require('passport')
const { XsuaaService, XssecPassportStrategy } = require('@sap/xssec')
const xsenv    = require('@sap/xsenv')

if (!process.env.VCAP_SERVICES) xsenv.loadEnv()

const app  = express()
const port = process.env.PORT || 3000

// ── Service binding ───────────────────────────────────────────────────────────
const { xsuaa } = xsenv.getServices({ xsuaa: { tag: 'xsuaa' } })
const xsuaaService = new XsuaaService(xsuaa)
passport.use('JWT', new XssecPassportStrategy(xsuaaService))
app.use(passport.initialize())
app.use(passport.authenticate('JWT', { session: false }))
app.use(express.json())

// ── Downstream URL ────────────────────────────────────────────────────────────
// Set via: cf set-env orders-prop-v2-backend USER_DATA_SERVICE_URL https://...
// or in manifest.yml env block after pushing user-data-service.
const USER_DATA_URL = (process.env.USER_DATA_SERVICE_URL || '').replace(/\/$/, '')

if (!USER_DATA_URL) {
  console.warn('[orders-backend] WARNING: USER_DATA_SERVICE_URL is not set. Proxy calls will fail.')
}

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

// ── Proxy helper ──────────────────────────────────────────────────────────────
// Calls user-data-service with the user's JWT forwarded as Bearer.
// user-data-service validates the same token — it sees alice, not this service.
async function callUserDataService(method, path, authHeader, body) {
  const url = `${USER_DATA_URL}${path}`
  const options = {
    method,
    headers: {
      'Authorization': authHeader,    // propagate the user's JWT
      'Content-Type':  'application/json'
    }
  }
  if (body) options.body = JSON.stringify(body)

  const response = await fetch(url, options)
  const data     = await response.json()
  return { status: response.status, data }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /token — raw JWT for jwt.io inspection
app.get('/token', (req, res) => {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  res.json({ token: raw })
})

// GET /health — shows what orders-backend sees for the current user
app.get('/health', async (req, res) => {
  const email = req.authInfo.getEmail()
  let downstream = null

  try {
    const result = await callUserDataService('GET', '/health', req.headers.authorization)
    downstream = result.data
  } catch (e) {
    downstream = { error: e.message }
  }

  res.json({
    status:     'ok',
    service:    'orders-backend',
    user:       email,
    downstream,
    note: 'downstream.authenticated_as should match user — that proves propagation'
  })
})

// GET /orders — validate scope here, then proxy to user-data-service
// user-data-service also validates scope from the same JWT
app.get('/orders', checkScope('orders.read'), async (req, res) => {
  try {
    const { status, data } = await callUserDataService('GET', '/orders', req.headers.authorization)
    res.status(status).json({
      via:        'orders-backend',
      user:       req.authInfo.getEmail(),
      propagated: data.user === req.authInfo.getEmail(),
      downstream: data
    })
  } catch (err) {
    console.error('[orders-backend] GET /orders error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// POST /orders — validate scope here, proxy to user-data-service
app.post('/orders', checkScope('orders.create'), async (req, res) => {
  const { product, quantity } = req.body
  if (!product || !quantity) {
    return res.status(400).json({ error: 'product and quantity are required' })
  }
  try {
    const { status, data } = await callUserDataService(
      'POST', '/orders', req.headers.authorization, { product, quantity }
    )
    res.status(status).json({
      via:        'orders-backend',
      user:       req.authInfo.getEmail(),
      propagated: data.user === req.authInfo.getEmail(),
      downstream: data
    })
  } catch (err) {
    console.error('[orders-backend] POST /orders error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`[orders-backend] Listening on port ${port}`)
  console.log(`[orders-backend] Forwarding to user-data-service at: ${USER_DATA_URL || '(not set)'}`)
})
