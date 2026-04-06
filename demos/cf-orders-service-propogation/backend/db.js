'use strict'

/**
 * db.js — per-request HANA connections for principal propagation demo.
 *
 * KEY DIFFERENCE from the secure demo's db.js:
 *
 *   Secure demo: one shared HANA connection opened at startup using a service
 *   account token (client_credentials grant). All queries run under the
 *   technical service identity. HANA CURRENT_USER = service account.
 *
 *   This demo: no connection at startup. Every request receives a user-scoped
 *   JWT (from the OBO exchange in app.js) and opens its own HANA connection
 *   authenticated as that user. HANA CURRENT_USER = alice@corp.com.
 *   The connection is closed after the query completes.
 *
 * Why per-request connections?
 *   HANA Cloud authenticates the connection at the moment of connect() using
 *   the provided JWT. Connection pooling with user tokens is possible but
 *   requires per-user pools and careful expiry management. For a demo that
 *   teaches the concept, per-request connections are the clearest approach.
 *
 * HANA table:
 *   ORDERS (ORDER_ID, PRODUCT, QUANTITY, CREATED_BY, STATUS, CREATED_AT)
 *   A CREATED_BY column stores the user email so you can see per-user rows
 *   when row-level security is also enabled on the HANA side.
 */

const hana = require('@sap/hana-client')

// ── Per-request connection ────────────────────────────────────────────────────

/**
 * Opens a HANA connection using a user-scoped JWT obtained via OBO exchange.
 * HANA authenticates the connection as the user identified by the token —
 * not as the backend service account.
 *
 * @param {object} hanaCredentials  The HANA binding credentials from VCAP_SERVICES
 * @param {string} userJwt          The OBO-exchanged JWT scoped for this HANA instance
 * @returns {Promise<object>}       An open hana-client connection
 */
function connectAsUser(hanaCredentials, userJwt) {
  const { host, port } = hanaCredentials
  const serverNode = `${host}:${port}`

  // webSocketToken is how hana-client accepts a JWT for authentication.
  // HANA validates the token signature (via XSUAA's public key configured in
  // the HANA Cloud instance) and sets CURRENT_USER to the token's subject.
  const connStr = [
    `ServerNode=${serverNode}`,
    'Encrypt=true',
    'sslValidateCertificate=true',
    `webSocketToken=${userJwt}`
  ].join(';')

  const client = hana.createConnection()
  return new Promise((resolve, reject) => {
    client.connect(connStr, (err) => {
      if (err) return reject(err)
      resolve(client)
    })
  })
}

function disconnect(client) {
  return new Promise((resolve) => {
    client.disconnect((err) => {
      if (err) console.warn('[db] disconnect error (ignored):', err.message)
      resolve()
    })
  })
}

// ── Schema setup ──────────────────────────────────────────────────────────────
// Call once manually or add to a setup script.
// CREATED_BY stores the user email so each row is visibly tied to a user —
// useful for demonstrating that propagation is working even without HANA
// row-level security grants configured.

async function ensureTable(hanaCredentials, serviceJwt) {
  const client = await connectAsUser(hanaCredentials, serviceJwt)
  try {
    await new Promise((resolve, reject) => {
      client.exec(
        `CREATE TABLE ORDERS (
           ORDER_ID   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
           PRODUCT    NVARCHAR(100)  NOT NULL,
           QUANTITY   INTEGER        NOT NULL,
           CREATED_BY NVARCHAR(200)  NOT NULL,
           STATUS     NVARCHAR(20)   DEFAULT 'pending',
           CREATED_AT TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
         )`,
        (err) => {
          if (err && err.code !== 288) return reject(err) // 288 = table already exists
          resolve()
        }
      )
    })
  } finally {
    await disconnect(client)
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Lists orders. If HANA row-level security is configured, HANA automatically
 * filters rows to those the current user has access to. If not, CREATED_BY
 * shows which user created each row.
 */
async function listOrdersAsUser(hanaCredentials, userJwt) {
  const client = await connectAsUser(hanaCredentials, userJwt)
  try {
    return await new Promise((resolve, reject) => {
      client.exec(
        'SELECT ORDER_ID, PRODUCT, QUANTITY, CREATED_BY, STATUS, CREATED_AT FROM ORDERS ORDER BY CREATED_AT DESC',
        (err, rows) => (err ? reject(err) : resolve(rows || []))
      )
    })
  } finally {
    await disconnect(client)
  }
}

/**
 * Inserts an order. CREATED_BY is set to CURRENT_USER (the propagated user).
 * This makes it visible in query results which user created each row —
 * without needing HANA row-level security to be configured.
 */
async function insertOrderAsUser(hanaCredentials, userJwt, product, quantity) {
  const client = await connectAsUser(hanaCredentials, userJwt)
  try {
    return await new Promise((resolve, reject) => {
      // CURRENT_USER is a HANA built-in that returns the authenticated user name.
      // Because we connected with the OBO token, this is alice@corp.com —
      // not the service account.
      client.prepare(
        'INSERT INTO ORDERS (PRODUCT, QUANTITY, CREATED_BY) VALUES (?, ?, CURRENT_USER)',
        (err, statement) => {
          if (err) return reject(err)
          statement.exec([product, quantity], (err2, result) => {
            err2 ? reject(err2) : resolve(result)
          })
        }
      )
    })
  } finally {
    await disconnect(client)
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = { connectAsUser, ensureTable, listOrdersAsUser, insertOrderAsUser }
