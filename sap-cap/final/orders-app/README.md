# Sales Order Management — CAP Demo App

This is the reference app for the **SAP CAP in Plain English** course. It demonstrates a complete order management backend built with CAP: OData service, HANA persistence, auth, remote services, eventing, and Fiori Elements UI.

You will build this backend step by step through the course. Use it as your reference for the end state of each section.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18 or higher | [nodejs.org](https://nodejs.org) |
| SAP CDS DK | latest | `npm install -g @sap/cds-dk` |
| Git | any | [git-scm.com](https://git-scm.com) |

Check your setup:

```bash
node --version        # must be 18+
cds --version         # must show @sap/cds version
```

---

## Option A — Local development (SQLite, no BTP needed)

This is the fastest path. CAP uses a local SQLite database seeded from the CSV files in `db/data/`.

**1. Install dependencies**

```bash
cd orders-app
npm install
```

**2. Deploy the schema and seed data**

```bash
cds deploy
```

This creates `db.sqlite` with all tables (including draft tables) and imports the seed data from `db/data/`. You only need to run this once — or again when you want to reset to the original data.

**3. Start the dev server**

```bash
cds watch
```

**4. Open the app**

Go to `http://localhost:4004`. Click **Fiori preview** next to **Orders** to open the List Report UI.

**5. Authenticate**

The app uses mocked authentication locally. When prompted for credentials, use any of the pre-configured users:

| Username | Password | Role |
|---|---|---|
| `sarah.jones@company.com` | `pass` | SalesRep |
| `michael.chen@company.com` | `pass` | SalesRep |
| `anna.mueller@company.com` | `pass` | SalesRep |
| `james.wilson@company.com` | `pass` | SalesRep |
| `manager@company.com` | `pass` | Manager |

> The password can be any non-empty string — only the username matters in mocked mode.

**6. Reset seed data**

To restore the original data after making changes:

```bash
rm db.sqlite db.sqlite-shm db.sqlite-wal
cds deploy
```

---

## Option B — HANA Cloud on BTP Trial

Use this path when you reach **Section 04 (Persistence with HANA Cloud)**. You will need a BTP Trial account with a running HANA Cloud instance.

### Prerequisites for this option

- BTP Trial account — [trial.btp.cloud.sap](https://trial.btp.cloud.sap)
- HANA Cloud instance started in your trial subaccount
- CF CLI installed — [docs.cloudfoundry.org/cf-cli](https://docs.cloudfoundry.org/cf-cli/install-go-cli.html)

### Steps

**1. Log in to Cloud Foundry**

Find your API endpoint in the BTP Cockpit under your subaccount overview (e.g. `https://api.cf.eu10.hana.ondemand.com`).

```bash
cf login -a <your-cf-api-endpoint>
```

Enter your BTP email and password when prompted. Select the trial org and space.

**2. Deploy the schema and seed data to HANA**

```bash
npm install
cds deploy --to hana
```

This command:
- Creates an HDI container service instance (`orders-app-db`) in your CF space
- Compiles the CDS schema to HANA artifacts
- Deploys the tables and imports the CSV seed data
- Takes ~2–3 minutes on first run

**3. Run the app locally connected to HANA**

After deploying, CAP generates a `default-env.json` file with the HANA credentials. Start the server using the production profile:

```bash
cds watch --profile production
```

The app now reads from and writes to your HANA Cloud instance. Open `http://localhost:4004` as before.

> **Note:** `default-env.json` contains credentials — it is in `.gitignore` and must never be committed.

---

## Project structure

```
orders-app/
  db/
    schema.cds          Entity definitions: Orders, OrderItems, Products, BusinessPartners
    data/               CSV seed files — auto-imported by CAP on deploy
  srv/
    order-service.cds   Service definition, OData path, bound actions
    order-service.js    Handlers: submit / approve / reject, status criticality
  app/
    orders/
      annotations.cds   Fiori Elements UI annotations (List Report + Object Page)
      webapp/
        manifest.json   Fiori app descriptor
  .cdsrc.json           Profiles for dev (SQLite + mocked auth) and production (HANA)
  package.json
```

---

## Seed data overview

| Entity | Count | Notes |
|---|---|---|
| BusinessPartners | 15 | Companies across US, Europe, APAC |
| Products | 25 | Hardware, Software, Service, Maintenance categories |
| Orders | 30 | Spread across all 5 statuses, 4 sales reps, Nov 2024–May 2025 |
| OrderItems | 62 | 2–3 items per order |

**Order status distribution:**

| Status | Count | Description |
|---|---|---|
| Draft | 5 | Orders being created |
| Submitted | 8 | Awaiting manager approval |
| Approved | 8 | Approved, pending fulfillment |
| Rejected | 4 | Rejected with reason |
| Fulfilled | 5 | Completed orders |

---

## What the course adds on top of this app

Each course section extends this same app. The demo app represents the end state — each section shows you how one piece was built.

| Section | What gets added |
|---|---|
| 02 — CDS | The `db/schema.cds` domain model |
| 03 — Services | `srv/order-service.cds` + OData generation |
| 04 — HANA | Switch from SQLite to HANA Cloud |
| 05 — Auth | `@requires`, `@restrict`, role collections |
| 06 — S/4HANA | BusinessPartners fetched from S/4 instead of local table |
| 07 — Eventing | Order confirmed → event published → Fulfillment Service |
| 08 — Annotations | `app/orders/annotations.cds` + Fiori Elements UI |
| 09 — Multi-tenancy | MTX sidecar, tenant-aware queries |
| 10 — Production | MTA descriptor, CF/Kyma deployment, CI/CD |
