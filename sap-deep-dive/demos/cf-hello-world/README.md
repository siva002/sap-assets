# cf-hello-world

A minimal Node.js app for the SAP BTP Deep Dive course.
Used in **Section 04 — BTP Runtime Architecture Deep Dive**, chapters 04 and 05.

The app itself is not the point. The point is watching Cloud Foundry receive it,
detect the buildpack, stage it, assign a route, and start it — all automatically.

---

## What's in here

| File | Why it exists |
|---|---|
| `app.js` | The running app. A plain Node.js HTTP server — no framework, no dependencies. |
| `package.json` | Tells CF to use the Node.js buildpack. Without this file, CF wouldn't know what runtime to use. |
| `manifest.yml` | The deployment contract. Tells CF the app name, memory limit, instance count, and buildpack. |

---

## Prerequisites

- An SAP BTP Trial account → https://cockpit.hanatrial.ondemand.com
- Cloud Foundry CLI installed → https://docs.cloudfoundry.org/cf-cli/install-go-cli.html
- A Cloud Foundry space enabled in your BTP subaccount

---

## Step-by-step

### 1. Log in to Cloud Foundry

```bash
cf login -a https://api.cf.us10-001.hana.ondemand.com
```

> Replace the API endpoint with the one shown in your BTP subaccount's Cloud Foundry overview.
> You'll be prompted for your BTP email and password.

### 2. Check you're in the right space

```bash
cf target
```

You should see your org and space. If not, set them:

```bash
cf target -o YOUR_ORG -s YOUR_SPACE
```

### 3. Deploy the app

From inside this folder (`demos/cf-hello-world/`):

```bash
cf push
```

CF reads `manifest.yml`, detects the Node.js buildpack from `package.json`, stages the app, and assigns a route. Watch the output — this is the cf push journey from chapter 03 happening live.

### 4. Open the app

Once the push completes, CF prints the route:

```
routes: cf-hello-world.cfapps.us10-001.hana.ondemand.com
```

Open it in a browser or curl it:

```bash
curl https://cf-hello-world.cfapps.us10-001.hana.ondemand.com
```

You should see:

```
Hello from Cloud Foundry!

App:      cf-hello-world
Space:    dev
Instance: 0
Port:     8080
```

Notice `Instance: 0` — CF injected that. You didn't write it. The platform did.

### 5. Check the app status

```bash
cf app cf-hello-world
```

### 6. Stream the logs

```bash
cf logs cf-hello-world --recent
```

### 7. Scale to 2 instances

```bash
cf scale cf-hello-world -i 2
```

Refresh the browser a few times — you may see `Instance: 1` appear. CF is load-balancing across both instances.

### 8. Clean up

```bash
cf delete cf-hello-world -r -f
```

The `-r` flag also deletes the route. The `-f` flag skips the confirmation prompt.

---

## What to point out on camera

- **Buildpack detection** — CF found `package.json` and picked the Node.js buildpack automatically. You didn't configure this — the platform did.
- **PORT injection** — The app listens on `process.env.PORT`, not a hardcoded port. CF assigns the port; the app just reads it.
- **VCAP_APPLICATION** — CF injects this JSON blob at runtime with app name, space, org, routes, and more. The app reads it to print the space name.
- **CF_INSTANCE_INDEX** — When you scale to 2 instances, each gets its own index (0, 1). Same code, different instance identity — injected by the platform.
