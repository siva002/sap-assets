# pf-bastion

Minimal Cloud Foundry app used as an SSH tunnel entry point to reach the private BTP PostgreSQL instance (`pf-postgres`) from localhost.

## What it does

The bastion does nothing — it runs `sleep infinity` and stays alive. Its only purpose is to give you a container inside BTP's private network that you can SSH into to forward a local port to the Postgres instance.

## Prerequisites

- CF CLI logged in: `cf login -a https://api.cf.<region>.hana.ondemand.com`
- `pf-postgres` service instance already created: `cf create-service postgresql-db development pf-postgres`

## Deploy

```sh
cf push
```

## Open the SSH tunnel

1. Get the Postgres hostname from the service key:
   ```sh
   cf service-key pf-postgres pf-postgres-key
   # note the "hostname" value, e.g. 10.44.12.87
   ```

2. Open the tunnel (keep this terminal open):
   ```sh
   cf ssh pf-bastion -L 5432:<hostname>:5432
   ```
   The terminal goes silent — that means the tunnel is active.

3. In a second terminal, connect using service key credentials:
   ```sh
   psql -h localhost -p 5432 -U <username> -d <dbname>
   ```

4. Press `Ctrl-C` in the tunnel terminal to close it when done.
