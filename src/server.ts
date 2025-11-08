import http from 'http'

const server = http.createServer(async (req, res) => {
  // Health check endpoint
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('OK - Video Processor Service')
    return
  }

  // Job trigger endpoint (placeholder - requires core.ts implementation)
  if (req.url === '/run' && req.method === 'POST') {
    res.writeHead(501, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      success: false, 
      error: 'Job execution not yet implemented - core.ts module missing' 
    }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
})

const PORT = process.env.PORT || 8080
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
