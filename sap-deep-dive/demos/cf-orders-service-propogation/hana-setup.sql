-- ── HANA Cloud setup for the principal propagation demo ──────────────────────
-- Run these statements in HANA Database Explorer as the schema owner
-- (the technical user from the HANA service binding).
--
-- What this creates:
--   ORDERS table         — stores orders with CREATED_BY = the propagated user
--   orders_rls policy    — filters SELECT to rows owned by CURRENT_USER
--
-- Why CREATED_BY = CURRENT_USER at INSERT:
--   The backend uses CURRENT_USER (a HANA built-in) rather than passing the
--   email from the JWT. This means HANA itself records the authenticated user
--   identity — it cannot be spoofed by the application.
--
-- After running this, deploy the app and POST an order as two different users.
-- GET /orders for each user will return only their own rows.
-- HANA Database Explorer → SELECT * FROM ORDERS shows all rows with CREATED_BY.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Create the ORDERS table
CREATE TABLE ORDERS (
  ORDER_ID   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  PRODUCT    NVARCHAR(100)  NOT NULL,
  QUANTITY   INTEGER        NOT NULL,
  CREATED_BY NVARCHAR(200)  NOT NULL,
  STATUS     NVARCHAR(20)   DEFAULT 'pending',
  CREATED_AT TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Create the row-level security policy
-- USING clause is evaluated per row at query time.
-- CURRENT_USER resolves to the identity that authenticated the HANA connection —
-- which, with principal propagation, is the real user (alice@corp.com).
CREATE ROWLEVELSECURITY orders_rls
  ON ORDERS
  FOR SELECT
  USING (CREATED_BY = CURRENT_USER);

-- Step 3: Activate the policy on the table
-- From this point every SELECT on ORDERS is filtered — no bypass possible
-- from application code.
ALTER TABLE ORDERS ENABLE ROW LEVEL SECURITY orders_rls;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- After deploying the app and creating some orders:
--
-- As schema owner (sees all rows):
SELECT ORDER_ID, PRODUCT, QUANTITY, CREATED_BY, CREATED_AT FROM ORDERS ORDER BY CREATED_AT DESC;
--
-- Expected: rows from all users visible here because schema owner is exempt
-- from the RLS policy by default.
--
-- Via the app (each user sees only their own):
-- GET /orders → { "orders": [...], "user": "alice@corp.com", "propagated": true }
-- ─────────────────────────────────────────────────────────────────────────────
