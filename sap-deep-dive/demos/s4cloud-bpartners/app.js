'use strict'

/**
 * app.js — s4cloud-bpartners demo for SAP BTP Deep Dive, Section 07 Chapter 09.
 *
 * Reads Business Partners from S/4HANA Cloud Public Edition via the BTP
 * Destination Service. No Cloud Connector — S/4HANA Cloud is internet-reachable.
 *
 * How it works:
 *   1. Reads the Destination Service credentials from VCAP_SERVICES.destination[0]
 *      (uri, clientid, clientsecret, url)
 *   2. Fetches an XSUAA token using client_credentials — needed to call the
 *      Destination Service API.
 *   3. Calls the Destination Service for the named destination.
 *      The service returns authTokens[0].http_header — a ready-to-use
 *      Authorization header (Basic/Bearer). The app never sees the raw password.
 *   4. Calls the S/4HANA Cloud Business Partner OData API directly over HTTPS
 *      using that auth header.
 *
 * Required service bindings (manifest.yml):
 *   - destination-instance
 *
 * Required env vars:
 *   - DESTINATION_NAME  (name of the BTP destination, safe to include in manifest)
 *
 * Routes:
 *   GET /           → app status
 *   GET /partners   → read Business Partners from S/4HANA Cloud
 */

const https = require('https')
const http  = require('http')

const PORT             = process.env.PORT || 8080
const DESTINATION_NAME = process.env.DESTINATION_NAME || 's4hana-public-cloud-trial'

// ── Parse VCAP_SERVICES ───────────────────────────────────────────────────────

function getDestinationCreds() {
  if (!process.env.VCAP_SERVICES) return null
  const vcap = JSON.parse(process.env.VCAP_SERVICES)
  const dest = vcap['destination']
  if (!dest || !dest[0]) return null
  return dest[0].credentials
}

// ── Fetch XSUAA token ─────────────────────────────────────────────────────────

async function fetchToken(xsuaaUrl, clientId, clientSecret) {
  const auth = Buffer.from(clientId + ':' + clientSecret).toString('base64')
  const res  = await fetch(xsuaaUrl + '/oauth/token', {
    method:  'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type':  'application/x-www-form-urlencoded',
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

// ── Fetch destination config ──────────────────────────────────────────────────

async function fetchDestination(destinationServiceUri, token, name) {
  const res = await fetch(
    destinationServiceUri + '/destination-configuration/v1/destinations/' + name,
    { headers: { 'Authorization': 'Bearer ' + token } }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error('Destination Service returned ' + res.status + ': ' + text)
  }
  return res.json()
}

// ── Call OData endpoint ───────────────────────────────────────────────────────

async function callOData(baseUrl, authHeader, path) {
  const res = await fetch(baseUrl + path, {
    headers: {
      'Authorization': authHeader,
      'Accept':        'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error('S/4HANA Cloud OData returned ' + res.status + ': ' + text.slice(0, 300))
  }
  return res.json()
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
  const creds = getDestinationCreds()

  // GET / — app status
  if (path === '/') {
    const vcap = process.env.VCAP_APPLICATION
      ? JSON.parse(process.env.VCAP_APPLICATION)
      : null
    return send(res, 200, {
      app:              vcap ? vcap.application_name : 's4cloud-bpartners (local)',
      space:            vcap ? vcap.space_name        : 'local',
      destination_name: DESTINATION_NAME,
      destination_svc:  creds ? creds.uri : 'not bound — cf bind-service s4cloud-bpartners destination-instance',
    })
  }

  // GET /partners — read Business Partners from S/4HANA Cloud
  if (path === '/partners') {
    if (!creds) {
      return send(res, 503, {
        error: 'Destination service not bound.',
        fix:   'cf bind-service s4cloud-bpartners destination-instance && cf restage s4cloud-bpartners',
      })
    }

    try {
      // Step 1: get XSUAA token to call the Destination Service
      console.log('[s4cloud-bpartners] fetching XSUAA token from', creds.url)
      const token = await fetchToken(creds.url, creds.clientid, creds.clientsecret)

      // Step 2: get destination config — Destination Service returns a ready-to-use auth header
      console.log('[s4cloud-bpartners] fetching destination', DESTINATION_NAME)
      const destInfo   = await fetchDestination(creds.uri, token, DESTINATION_NAME)
      const authHeader = destInfo.authTokens[0].http_header.value
      const baseUrl    = destInfo.destinationConfiguration.URL

      // Step 3: call Business Partner API directly — no proxy, plain HTTPS
      console.log('[s4cloud-bpartners] calling', baseUrl)
      const data = await callOData(baseUrl, authHeader,
        '/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner' +
        '?$top=10&$select=BusinessPartner,BusinessPartnerFullName,BusinessPartnerCategory,SearchTerm1&$format=json'
      )

      const partners = data.d.results.map(p => ({
        businessPartner: p.BusinessPartner,
        fullName:        p.BusinessPartnerFullName,
        category:        p.BusinessPartnerCategory === '2' ? 'Organisation' : 'Person',
        searchTerm:      p.SearchTerm1,
      }))

      return send(res, 200, {
        source:      DESTINATION_NAME + ' (S/4HANA Cloud)',
        destination: baseUrl,
        count:       partners.length,
        partners,
      })
    } catch (err) {
      console.error('[s4cloud-bpartners] /partners error:', err.message)
      return send(res, 500, { error: err.message })
    }
  }

  send(res, 404, { error: req.method + ' ' + path + ' not found' })
})

server.listen(PORT, () => {
  const creds = getDestinationCreds()
  console.log('[s4cloud-bpartners] Listening on port', PORT)
  console.log('[s4cloud-bpartners] Destination:', DESTINATION_NAME)
  console.log('[s4cloud-bpartners] Destination Service:', creds ? creds.uri : 'not bound')
})
