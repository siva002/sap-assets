'use strict'

/**
 * db.js — HANA Cloud connection for the order-service demo.
 *
 * Reads credentials from VCAP_SERVICES (injected by CF at runtime when the
 * service is bound). If VCAP_SERVICES is absent or has no hana binding, all
 * exported functions reject so the HTTP layer can return a 503.
 */

const hdb = require('hdb')

let client = null

// ── Credential parsing ────────────────────────────────────────────────────────

function parseCredentials() {
  if (!process.env.VCAP_SERVICES) return null

  const services = JSON.parse(process.env.VCAP_SERVICES)

  // CF injects HANA Cloud bindings under the 'hana' key
  const bindings = services['hana']
  if (!bindings || !bindings.length) return null

  return bindings[0].credentials
}

// ── Connection ────────────────────────────────────────────────────────────────

function connect() {
  const creds = parseCredentials()
  if (!creds) {
    return Promise.reject(
      new Error(
        'No HANA binding found in VCAP_SERVICES.\n' +
        'Run: cf bind-service order-service orders-db && cf restage order-service'
      )
    )
  }

  client = hdb.createClient({
    host:                   creds.host,
    port:                   parseInt(creds.port, 10),
    user:                   creds.user,
    password:               creds.password,
    useSsl:                 true,
    // Use the certificate from the binding if present; otherwise skip validation
    // (acceptable for trial/dev — use a CA cert in production)
    sslValidateCertificate: !!creds.certificate,
    sslCACert:              creds.certificate || undefined
  })

  return new Promise((resolve, reject) => {
    client.connect((err) => {
      if (err) {
        client = null
        return reject(err)
      }
      resolve(client)
    })
  })
}

// ── Schema setup ──────────────────────────────────────────────────────────────

function ensureTable() {
  return new Promise((resolve, reject) => {
    // HANA uses CREATE TABLE with an explicit schema — we rely on the default
    // schema from the binding credentials, so no schema prefix needed.
    client.exec(
      `CREATE TABLE IF NOT EXISTS ORDERS (
         ORDER_ID   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
         PRODUCT    NVARCHAR(100)  NOT NULL,
         QUANTITY   INTEGER        NOT NULL,
         STATUS     NVARCHAR(20)   DEFAULT 'pending',
         CREATED_AT TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
       )`,
      (err) => (err ? reject(err) : resolve())
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
