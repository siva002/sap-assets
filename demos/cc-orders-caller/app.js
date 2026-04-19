'use strict'

/**
 * app.js — cc-orders-caller demo for SAP BTP Deep Dive, Section 07 Chapter 03.
 *
 * Demonstrates calling an on-premise system through the Cloud Connector tunnel.
 *
 * How it works:
 *   1. Reads the Connectivity Service credentials from VCAP_SERVICES
 *      (onpremise_proxy_host, onpremise_proxy_port, clientid, clientsecret, url)
 *   2. Fetches an OAuth token from XSUAA using client credentials
 *      The Connectivity Service proxy REQUIRES Proxy-Authorization: Bearer <token>
 *      — without it every request is rejected even if the proxy address is correct.
 *   3. Sends a plain HTTP proxy request to the Connectivity proxy:
 *        GET http://fakesap:443/orders HTTP/1.1
 *        Proxy-Authorization: Bearer <token>
 *        SAP-Connectivity-SCC-Location_ID: <location_id>
 *      NOTE: undici ProxyAgent uses HTTP CONNECT tunnel which the BTP Connectivity
 *      proxy rejects (405). Plain HTTP proxy via node:http works correctly.
 *   4. CC resolves virtual host fakesap:443 → localhost:3000 on your machine
 *
 * Required service bindings (manifest.yml):
 *   - connectivity-instance  (provides proxy + XSUAA credentials in one binding)
 *
 * Required env vars (manifest.yml):
 *   - CC_LOCATION_ID  — Location ID of your Cloud Connector instance (e.g. "mac")
 *                        Leave empty string if your CC has no Location ID set.
 *
 * Routes:
 *   GET /         → app status + proxy info
 *   GET /orders   → fetch orders through CC tunnel
 */

const http = require('http')

const PORT = process.env.PORT || 8080

// ── Parse VCAP_SERVICES ───────────────────────────────────────────────────────

function getConnectivityCreds() {
  if (!process.env.VCAP_SERVICES) return null
  const vcap = JSON.parse(process.env.VCAP_SERVICES)
  const conn = vcap['connectivity']
  if (!conn || !conn[0]) return null
  return conn[0].credentials
}

// ── Get XSUAA token ───────────────────────────────────────────────────────────
// The Connectivity proxy requires Proxy-Authorization: Bearer <token>.
// The token is fetched from XSUAA using the client credentials in the
// Connectivity service binding — no separate XSUAA binding needed.

async function getAccessToken(creds) {
  const tokenUrl = creds.url + '/oauth/token'
  const auth = Buffer.from(creds.clientid + ':' + creds.clientsecret).toString('base64')

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error('XSUAA token request failed (' + res.status + '): ' + text)
  }

  const { access_token } = await res.json()
  return access_token
}

// ── Plain HTTP proxy request ──────────────────────────────────────────────────
// The SAP Connectivity proxy at port 20003 is a plain HTTP proxy.
// It does NOT support HTTP CONNECT tunneling for HTTP backends (returns 405).
// We must send: GET http://fakesap:443/orders HTTP/1.1
// with Proxy-Authorization and SAP-Connectivity-SCC-Location_ID headers.

function proxyRequest(proxyHost, proxyPort, targetUrl, token, locationId) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Host':                'fakesap:443',
      'Proxy-Authorization': 'Bearer ' + token,
    }
    if (locationId) {
      headers['SAP-Connectivity-SCC-Location_ID'] = locationId
    }

    const req = http.request({
      hostname: proxyHost,
      port:     proxyPort,
      path:     targetUrl,   // full URL as path = HTTP proxy forwarding (no CONNECT)
      method:   'GET',
      headers,
    }, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        console.log('[cc-orders-caller] proxy responded:', res.statusCode, body.slice(0, 200))
        if (res.statusCode !== 200) {
          reject(new Error('Proxy/upstream returned ' + res.statusCode + ': ' + body))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(new Error('Invalid JSON from upstream: ' + body.slice(0, 200)))
        }
      })
    })

    req.on('error', (err) => {
      console.error('[cc-orders-caller] http.request error:', err)
      reject(err)
    })

    req.end()
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body, null, 2))
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url   = new URL(req.url, 'http://' + req.headers.host)
  const path  = url.pathname
  const creds = getConnectivityCreds()

  // GET / — app status
  if (path === '/') {
    const vcap = process.env.VCAP_APPLICATION
      ? JSON.parse(process.env.VCAP_APPLICATION)
      : null
    return send(res, 200, {
      app:          vcap ? vcap.application_name : 'cc-orders-caller (local)',
      space:        vcap ? vcap.space_name        : 'local',
      tunnel_proxy: creds
        ? creds.onpremise_proxy_host + ':' + creds.onpremise_proxy_port
        : 'not bound — cf bind-service cc-orders-caller connectivity-instance',
      location_id:  process.env.CC_LOCATION_ID || '(none)',
      target_url:   'http://fakesap:443/orders',
    })
  }

  // GET /orders — call through the CC tunnel
  if (path === '/orders') {
    if (!creds) {
      return send(res, 503, {
        error: 'Connectivity service not bound.',
        fix:   'cf bind-service cc-orders-caller connectivity-instance && cf restage cc-orders-caller',
      })
    }

    const locationId = process.env.CC_LOCATION_ID || ''

    try {
      // Step 1: get a token — the proxy refuses requests without Proxy-Authorization
      console.log('[cc-orders-caller] fetching XSUAA token from', creds.url)
      const token = await getAccessToken(creds)
      console.log('[cc-orders-caller] token ok, calling proxy', creds.onpremise_proxy_host + ':' + creds.onpremise_proxy_port, 'location_id=' + (locationId || '(none)'))

      // Step 2: plain HTTP proxy request — no CONNECT tunnel
      const orders = await proxyRequest(
        creds.onpremise_proxy_host,
        creds.onpremise_proxy_port,
        'http://fakesap:443/orders',
        token,
        locationId,
      )

      return send(res, 200, {
        source:      'fakesap:443 via CC tunnel',
        proxy:       creds.onpremise_proxy_host + ':' + creds.onpremise_proxy_port,
        location_id: locationId || '(none)',
        orders,
      })
    } catch (err) {
      console.error('[cc-orders-caller] /orders error:', err.message)
      return send(res, 500, {
        error:       err.message,
        proxy:       creds.onpremise_proxy_host + ':' + creds.onpremise_proxy_port,
        location_id: locationId || '(none)',
        target:      'http://fakesap:443/orders',
      })
    }
  }

  send(res, 404, { error: req.method + ' ' + path + ' not found' })
})

server.listen(PORT, () => {
  const creds = getConnectivityCreds()
  console.log('[cc-orders-caller] Listening on port', PORT)
  console.log('[cc-orders-caller] Proxy:', creds
    ? creds.onpremise_proxy_host + ':' + creds.onpremise_proxy_port
    : 'not bound')
  console.log('[cc-orders-caller] CC Location ID:', process.env.CC_LOCATION_ID || '(none)')
})
