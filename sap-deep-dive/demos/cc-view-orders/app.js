'use strict'

/**
 * app.js — cc-view-orders demo for SAP BTP Deep Dive, Section 07 Chapter 10.
 *
 * Calls the real S/4HANA API_SALES_ORDER_SRV through the Cloud Connector tunnel.
 *
 * How it works:
 *   1. Reads Connectivity Service credentials from VCAP_SERVICES
 *   2. Fetches a Proxy-Authorization token from XSUAA (connectivity client creds)
 *   3. Sends an HTTP proxy request through the CC tunnel:
 *        GET http://s4hana:8037/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder
 *        Proxy-Authorization: Bearer <token>
 *        Authorization: Basic <s4hana-credentials>
 *        SAP-Connectivity-SCC-Location_ID: s4hana
 *   4. CC resolves virtual host s4hana:8037 → 192.168.10.93:8037
 *
 * Required service bindings (manifest.yml):
 *   - connectivity-instance
 *
 * Required env vars:
 *   - CC_LOCATION_ID  — Location ID of your CC instance (e.g. "s4hana")
 *   - S4_USER         — S/4HANA username
 *   - S4_PASSWORD     — S/4HANA password
 *
 * Routes:
 *   GET /         → app status
 *   GET /orders   → top 5 open sales orders from S/4HANA
 */

const http = require('http')

const PORT           = process.env.PORT || 8080
const S4_VHOST       = 's4hana'
const S4_VPORT       = 8037
const ODATA_ENDPOINT = '/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder'
const ODATA_PARAMS   = '?$top=5&$format=json&$select=SalesOrder,SoldToParty,TotalNetAmount,TransactionCurrency,CreationDate,OverallDeliveryStatus'

// ── VCAP helpers ──────────────────────────────────────────────────────────────

function getConnectivityCreds() {
  if (!process.env.VCAP_SERVICES) return null
  const vcap = JSON.parse(process.env.VCAP_SERVICES)
  const conn = vcap['connectivity']
  if (!conn || !conn[0]) return null
  return conn[0].credentials
}

// ── XSUAA token ───────────────────────────────────────────────────────────────
// The Connectivity proxy requires Proxy-Authorization: Bearer <token>.
// Token is fetched using the connectivity service's own clientid/clientsecret.

async function getProxyToken(creds) {
  const auth = Buffer.from(creds.clientid + ':' + creds.clientsecret).toString('base64')
  const res = await fetch(creds.url + '/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization':  'Basic ' + auth,
      'Content-Type':   'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error('XSUAA token request failed: ' + res.status)
  const { access_token } = await res.json()
  return access_token
}

// ── HTTP proxy request ────────────────────────────────────────────────────────
// The BTP Connectivity proxy at port 20003 is a plain HTTP proxy (not CONNECT).
// Send the full target URL as the request path.

function proxyRequest({ proxyHost, proxyPort, targetUrl, proxyToken, locationId, s4AuthHeader }) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Host':                              S4_VHOST + ':' + S4_VPORT,
      'Proxy-Authorization':               'Bearer ' + proxyToken,
      'Authorization':                     s4AuthHeader,
      'Accept':                            'application/json',
    }
    if (locationId) {
      headers['SAP-Connectivity-SCC-Location_ID'] = locationId
    }

    const req = http.request({
      hostname: proxyHost,
      port:     proxyPort,
      path:     targetUrl,
      method:   'GET',
      headers,
    }, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        console.log('[cc-view-orders] proxy responded:', res.statusCode, body.slice(0, 120))
        if (res.statusCode !== 200) {
          reject(new Error('S/4HANA returned HTTP ' + res.statusCode + ': ' + body.slice(0, 500)))
          return
        }
        try   { resolve(JSON.parse(body)) }
        catch { reject(new Error('Non-JSON response: ' + body.slice(0, 200))) }
      })
    })

    req.on('error', reject)
    req.end()
  })
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body, null, 2))
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://' + req.headers.host).pathname
  const creds    = getConnectivityCreds()

  if (pathname === '/') {
    const vcap = process.env.VCAP_APPLICATION ? JSON.parse(process.env.VCAP_APPLICATION) : null
    return send(res, 200, {
      app:         vcap ? vcap.application_name : 'cc-view-orders (local)',
      proxy:       creds ? creds.onpremise_proxy_host + ':' + creds.onpremise_proxy_port : 'not bound',
      location_id: process.env.CC_LOCATION_ID || '(none)',
      target:      'http://' + S4_VHOST + ':' + S4_VPORT + ODATA_ENDPOINT + ODATA_PARAMS,
    })
  }

  if (pathname === '/orders') {
    if (!creds) {
      return send(res, 503, {
        error: 'Connectivity service not bound',
        fix:   'cf bind-service cc-view-orders connectivity-instance && cf restage cc-view-orders',
      })
    }

    const s4User = process.env.S4_USER
    const s4Pass = process.env.S4_PASSWORD
    if (!s4User || !s4Pass) {
      return send(res, 503, {
        error: 'S4_USER and S4_PASSWORD are not set',
        fix: [
          'cf set-env cc-view-orders S4_USER <your-s4-username>',
          'cf set-env cc-view-orders S4_PASSWORD <your-s4-password>',
          'cf restage cc-view-orders',
        ],
      })
    }

    const locationId    = process.env.CC_LOCATION_ID || ''
    const s4AuthHeader  = 'Basic ' + Buffer.from(s4User + ':' + s4Pass).toString('base64')
    const targetUrl     = 'http://' + S4_VHOST + ':' + S4_VPORT + ODATA_ENDPOINT + ODATA_PARAMS

    try {
      console.log('[cc-view-orders] fetching proxy token...')
      const proxyToken = await getProxyToken(creds)

      console.log('[cc-view-orders] calling S/4HANA via proxy', creds.onpremise_proxy_host + ':' + creds.onpremise_proxy_port)
      const data = await proxyRequest({
        proxyHost:    creds.onpremise_proxy_host,
        proxyPort:    creds.onpremise_proxy_port,
        targetUrl,
        proxyToken,
        locationId,
        s4AuthHeader,
      })

      const orders = (data.d && data.d.results) || []
      return send(res, 200, {
        source:      's4hana:8037 via CC tunnel → 192.168.10.93:8037',
        location_id: locationId || '(none)',
        count:       orders.length,
        orders:      orders.map(o => ({
          salesOrder:            o.SalesOrder,
          soldToParty:           o.SoldToParty,
          totalNetAmount:        o.TotalNetAmount,
          currency:              o.TransactionCurrency,
          creationDate:          o.CreationDate,
          overallDeliveryStatus: o.OverallDeliveryStatus,
        })),
      })
    } catch (err) {
      console.error('[cc-view-orders] /orders error:', err.message)
      return send(res, 500, {
        error:       err.message,
        proxy:       creds.onpremise_proxy_host + ':' + creds.onpremise_proxy_port,
        location_id: locationId || '(none)',
      })
    }
  }

  send(res, 404, { error: req.method + ' ' + pathname + ' not found' })
})

server.listen(PORT, () => {
  const creds = getConnectivityCreds()
  console.log('[cc-view-orders] Listening on port', PORT)
  console.log('[cc-view-orders] Proxy:', creds
    ? creds.onpremise_proxy_host + ':' + creds.onpremise_proxy_port
    : 'not bound — cf bind-service cc-view-orders connectivity-instance')
  console.log('[cc-view-orders] CC Location ID:', process.env.CC_LOCATION_ID || '(none)')
})
