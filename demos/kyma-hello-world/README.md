# kyma-hello-world

A minimal Node.js app for the SAP BTP Deep Dive course.
Used in **Section 04 — BTP Runtime Architecture Deep Dive**, Chapter 08.

The app itself is not the point. The point is watching **you** build the container image,
push it to a registry, write the manifests, and then watch Kyma schedule and run it —
every step that Cloud Foundry did invisibly, you do explicitly here.

Compare with `demos/cf-hello-world` to feel the abstraction difference.

---

## What's in here

| File | Why it exists |
|---|---|
| `app.js` | The running app. Plain Node.js HTTP server — no framework, no dependencies. |
| `package.json` | Metadata. Tells Docker/Node which version to use. |
| `Dockerfile` | **You write this.** CF didn't need one — Kyma does. This is the build contract. |
| `k8s/deployment.yaml` | Tells Kubernetes what to run, how many replicas, and which env vars to inject. |
| `k8s/service.yaml` | Exposes the Pod inside the cluster — routes traffic from port 80 to container port 8080. |
| `k8s/apirule.yaml` | Kyma-specific. Exposes the Service to the internet via the Istio API Gateway. |

---

## Prerequisites

- An SAP BTP subaccount with **Kyma runtime** enabled
- `kubectl` installed and configured with your Kyma cluster's kubeconfig
- Docker installed and logged in to Docker Hub (or another registry)
- Your Kyma kubeconfig downloaded from BTP cockpit

---

## Step-by-step

### 1. Download your Kyma kubeconfig

In BTP Cockpit → your subaccount → Kyma Environment → click **Download Kubeconfig**.

```bash
export KUBECONFIG=~/Downloads/kubeconfig.yaml
kubectl get nodes
```

You should see the Kyma worker nodes listed.

### 2. Create a namespace

```bash
kubectl create namespace demo
kubectl label namespace demo istio-injection=enabled
```

> The `istio-injection=enabled` label tells Kyma to inject the Istio sidecar into every Pod in this namespace — enabling mTLS and observability automatically.

### 3. Build the container image

From inside this folder (`demos/kyma-hello-world/`):

```bash
docker build -t docker.io/YOUR_DOCKERHUB_USERNAME/kyma-hello-world:latest .
```

> This is the step CF's buildpack did for you invisibly. Here you own it.

### 4. Push the image to the registry

```bash
docker push docker.io/YOUR_DOCKERHUB_USERNAME/kyma-hello-world:latest
```

> This is the step CF's blobstore handled for you. Here you push to Docker Hub (your container registry).

### 5. Update the image reference in the Deployment

Edit `k8s/deployment.yaml` and replace `YOUR_DOCKERHUB_USERNAME` with your actual Docker Hub username.

### 6. Apply the manifests

```bash
kubectl apply -f k8s/
```

Kubernetes reads all three files and creates the Deployment, Service, and APIRule.

### 7. Watch the Pod come up

```bash
kubectl get pods -n demo -w
```

Wait until the Pod shows `2/2 Running` — the `2/2` means your app container **and** the Istio sidecar are both running.

### 8. Find your public URL

```bash
kubectl get apirule kyma-hello-world -n demo -o jsonpath='{.spec.host}'
```

Or check BTP Cockpit → Kyma Dashboard → API Rules.

The URL will look like:
```
https://kyma-hello-world.<cluster-id>.kyma.ondemand.com
```

### 9. Access the app

```bash
curl https://kyma-hello-world.<cluster-id>.kyma.ondemand.com
```

You should see:

```
Hello from Kyma!

Pod:       kyma-hello-world-6d8f7b9c4-xk2pq
Namespace: demo
Node:      shoot--btp--cluster-worker-abc123
Port:      8080
```

Notice the Pod name includes a random hash — Kubernetes generated that. You didn't name the Pod. The platform did.

### 10. Scale to 2 replicas

```bash
kubectl scale deployment kyma-hello-world -n demo --replicas=2
kubectl get pods -n demo
```

Refresh the browser a few times — the Pod name in the response will change as Kyma load-balances across both Pods.

### 11. Check logs

```bash
kubectl logs -n demo -l app=kyma-hello-world -c kyma-hello-world
```

### 12. Clean up

```bash
kubectl delete namespace demo
```

Deleting the namespace removes everything inside it — Deployment, Pods, Service, APIRule.

---

## What to point out on camera

- **The Dockerfile** — CF didn't need this. You wrote it. This is the build contract that CF's buildpack handled automatically.
- **The registry push** — CF stored your droplet in its own blobstore. Here you pushed to Docker Hub — your container registry. Same concept, different ownership.
- **Downward API** — The Pod prints its own name, namespace, and node. You didn't hardcode those. Kubernetes injected them at runtime via the Downward API — the same concept as CF injecting `CF_INSTANCE_INDEX` and `VCAP_APPLICATION`.
- **`2/2` in `kubectl get pods`** — Two containers in one Pod: your app, and the Istio sidecar Kyma injected automatically. You didn't configure the sidecar — the namespace label triggered it.
- **APIRule** — CF's Gorouter gave you a URL automatically on push. In Kyma you write a `kind: APIRule` YAML. More control, more steps.
- **`kubectl delete namespace demo`** — One command removes everything. Namespaces are the isolation boundary — same concept as CF Spaces.

---

## CF vs Kyma — the same app, side by side

| Step | Cloud Foundry | Kyma |
|---|---|---|
| Build | `cf push` (buildpack auto-detects) | `docker build` (you write the Dockerfile) |
| Store | Blobstore (platform-managed) | Docker Hub (you push it) |
| Deploy | `cf push` reads `manifest.yml` | `kubectl apply -f k8s/` |
| Scale | `cf scale -i 2` | `kubectl scale --replicas=2` |
| URL | Automatic on push | `kind: APIRule` YAML |
| Logs | `cf logs` | `kubectl logs` |
| Cleanup | `cf delete -r -f` | `kubectl delete namespace` |
