import express from 'express'
import { generateBlog } from './blog-cloud-function'

const app = express()
const port = process.env.PORT || 8080

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'blog-generator' })
})

app.get('/status', (req, res) => {
  res.json({ 
    status: 'ready', 
    service: 'blog-generator',
    timestamp: new Date().toISOString()
  })
})

// Blog generation endpoint
app.post('/generateBlog', async (req, res) => {
  try {
    await generateBlog(req, res)
  } catch (error) {
    console.error('Error in generateBlog:', error)
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
    }
  }
})

// Start server
app.listen(port, () => {
  console.log(`🚀 Blog generator server listening on port ${port}`)
  console.log(`   Health: http://localhost:${port}/health`)
  console.log(`   Status: http://localhost:${port}/status`)
  console.log(`   Generate: POST http://localhost:${port}/generateBlog`)
})
