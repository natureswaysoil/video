/**
 * Cloud Function entry point for automated blog generation
 * Triggered by Cloud Scheduler every 2 days
 */

import 'dotenv/config'
import { runBlogGeneration } from './blog-generator'
import { Request, Response } from 'express'

/**
 * HTTP Cloud Function entry point
 */
export async function generateBlog(req: Request, res: Response) {
  console.log('📨 Blog generation request received')
  console.log('   Method:', req.method)
  console.log('   Headers:', req.headers)
  
  // Verify request is from Cloud Scheduler
  const schedulerHeader = req.headers['x-cloudscheduler']
  if (!schedulerHeader && process.env.NODE_ENV === 'production') {
    console.error('❌ Unauthorized request - not from Cloud Scheduler')
    res.status(403).send('Forbidden: Must be called from Cloud Scheduler')
    return
  }

  try {
    // Run the blog generation
    await runBlogGeneration()
    
    res.status(200).json({
      success: true,
      message: 'Blog article and video generated successfully',
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('❌ Blog generation failed:', error)
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}

// For local testing
if (require.main === module) {
  console.log('🧪 Running in local test mode')
  const mockReq = { method: 'POST', headers: {} } as Request
  const mockRes = {
    status: (code: number) => ({
      json: (data: any) => console.log(`Response ${code}:`, data),
      send: (data: any) => console.log(`Response ${code}:`, data)
    })
  } as unknown as Response
  
  generateBlog(mockReq, mockRes)
}
