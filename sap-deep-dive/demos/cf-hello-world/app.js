const http = require('http')

const port = process.env.PORT || 3000

// CF injects these at runtime - this is the platform doing its job
const instanceIndex = process.env.CF_INSTANCE_INDEX || 'local'
const vcap = process.env.VCAP_APPLICATION ? JSON.parse(process.env.VCAP_APPLICATION) : null
const spaceName = vcap ? vcap.space_name : 'local'
const appName = vcap ? vcap.application_name : 'cf-hello-world'

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(
    `Hello from Cloud Foundry!\n\n` +
    `App:      ${appName}\n` +
    `Space:    ${spaceName}\n` +
    `Instance: ${instanceIndex}\n` +
    `Port:     ${port}\n`
  )
})

server.listen(port, () => {
  console.log(`App started on port ${port}`)
})
