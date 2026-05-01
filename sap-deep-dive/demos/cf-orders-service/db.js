'use strict'

/**
 * db.js — HANA Cloud connection for the order-service demo.
 *
 * Uses @sap/hana-client (SAP's official Node.js driver), which supports
 * both password credentials and OAuth JWT natively — so the same code works
 * with both the default hana-cloud binding (OAuth) and a PASSWORD_CREDENTIAL
 * binding, without any manual token fetching.
 */

const hana = require('@sap/hana-client')

let client = null

// ── Credential parsing ────────────────────────────────────────────────────────

function parseManualCredentials() {
  const { HANA_HOST, HANA_PORT, HANA_USER, HANA_PASSWORD } = process.env
  if (!HANA_HOST || !HANA_PORT || !HANA_USER || !HANA_PASSWORD) return null
  return { host: HANA_HOST, port: HANA_PORT, user: HANA_USER, password: HANA_PASSWORD }
}

function parseCredentials() {
  const manual = parseManualCredentials()
  if (manual) return manual

  if (!process.env.VCAP_SERVICES) return null

  const services = JSON.parse(process.env.VCAP_SERVICES)

  // Search all service arrays for a binding tagged 'hana'.
  // The label is 'hana' in some regions and 'hana-cloud' in others —
  // using tags makes this portable across BTP environments.
  for (const entries of Object.values(services)) {
    const binding = entries.find(
      b => Array.isArray(b.tags) && b.tags.includes('hana')
    )
    if (binding) return binding.credentials
  }

  return null
}

// ── Connection ────────────────────────────────────────────────────────────────

function connect() {
  const creds = parseCredentials()
  if (!creds) {
    return Promise.reject(
      new Error(
        'No usable HANA credentials found.\n' +
        'Bind a HANA service and restage:\n' +
        '  cf bind-service order-service freshfoods-hana && cf push'
      )
    )
  }

  const serverNode = `${creds.host}:${creds.port}`
  const baseOpts = {
    serverNode,
    encrypt:               'true',
    sslValidateCertificate: 'true'
  }

  client = hana.createConnection()

  // Mode 1: password credentials (PASSWORD_CREDENTIAL binding or manual env vars)
  if (creds.user && creds.password) {
    return new Promise((resolve, reject) => {
      client.connect({ ...baseOpts, uid: creds.user, pwd: creds.password }, (err) => {
        if (err) { client = null; return reject(err) }
        resolve(client)
      })
    })
  }

  // Default OAuth binding — fetch a bearer token from UAA and present it
  // to HANA Cloud via JWT authentication (connection string format).
  if (creds.uaa?.url && creds.uaa?.clientid && creds.uaa?.clientsecret) {
    return fetchOAuthToken(creds.uaa).then((token) => {
      console.log('[order-service] OAuth token obtained, connecting to HANA...')
      const connStr = `ServerNode=${serverNode};Encrypt=true;sslValidateCertificate=true;webSocketToken=${token}`
      return new Promise((resolve, reject) => {
        client.connect(connStr, (err) => {
          if (err) { client = null; return reject(err) }
          resolve(client)
        })
      })
    })
  }

  return Promise.reject(
    new Error('HANA binding found but credentials are unusable (no user/password and no UAA OAuth details).')
  )
}

async function fetchOAuthToken(uaa) {
  const tokenUrl = `${uaa.url.replace(/\/$/, '')}/oauth/token`
  const basic = Buffer.from(`${uaa.clientid}:${uaa.clientsecret}`).toString('base64')
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  })
  if (!response.ok) throw new Error(`OAuth token request failed (${response.status}): ${await response.text()}`)
  const { access_token } = await response.json()
  if (!access_token) throw new Error('OAuth token response missing access_token')
  console.log('[order-service] Fetched UAA token successfully')
  return access_token
}

// ── Schema setup ──────────────────────────────────────────────────────────────

function ensureTable() {
  return new Promise((resolve, reject) => {
    client.exec(
      `CREATE TABLE ORDERS (
         ORDER_ID   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
         PRODUCT    NVARCHAR(100)  NOT NULL,
         QUANTITY   INTEGER        NOT NULL,
         STATUS     NVARCHAR(20)   DEFAULT 'pending',
         CREATED_AT TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
       )`,
      (err) => {
        // 288 = table already exists — that's fine on subsequent startups
        if (err && err.code !== 288) return reject(err)
        resolve()
      }
    )
  })
}

// ── Queries ───────────────────────────────────────────────────────────────────

function listOrders() {
  return new Promise((resolve, reject) => {
    client.exec(
      'SELECT ORDER_ID, PRODUCT, QUANTITY, STATUS, CREATED_AT FROM ORDERS ORDER BY CREATED_AT DESC',
      (err, rows) => (err ? reject(err) : resolve(rows || []))
    )
  })
}

function insertOrder(product, quantity) {
  return new Promise((resolve, reject) => {
    client.prepare(
      'INSERT INTO ORDERS (PRODUCT, QUANTITY) VALUES (?, ?)',
      (err, statement) => {
        if (err) return reject(err)
        statement.exec([product, quantity], (err2, result) => {
          err2 ? reject(err2) : resolve(result)
        })
      }
    )
  })
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = { parseCredentials, connect, ensureTable, listOrders, insertOrder }
