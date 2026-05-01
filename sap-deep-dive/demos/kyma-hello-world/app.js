const http = require('http')

const port = process.env.PORT || 8080

// Kubernetes injects these via the Downward API — this is the platform doing its job
// (equivalent of CF injecting CF_INSTANCE_INDEX and VCAP_APPLICATION)
const podName      = process.env.POD_NAME      || 'local'
const podNamespace = process.env.POD_NAMESPACE || 'local'
const nodeName     = process.env.NODE_NAME     || 'local'

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(
    `Hello from Kyma!\n\n` +
    `Pod:       ${podName}\n` +
    `Namespace: ${podNamespace}\n` +
    `Node:      ${nodeName}\n` +
    `Port:      ${port}\n`
  )
})

server.listen(port, () => {
  console.log(`App started on port ${port}`)
})
