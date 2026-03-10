import type { VercelRequest, VercelResponse } from '@vercel/node'
import { execFile } from 'child_process'
import path from 'path'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('🕐 Cron triggered at', new Date().toISOString())

  const cliPath = path.join(process.cwd(), 'dist', 'cli.js')
  
  // Always return 200 - log errors but don't fail the cron
  const result = await new Promise<{ stdout: string; stderr: string; error: string | null }>((resolve) => {
    execFile('node', [cliPath], {
      timeout: 240000,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      env: process.env,
    }, (error: any, stdout: any, stderr: any) => {
      if (stdout) console.log(stdout)
      if (stderr) console.error(stderr)
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        error: error ? error.message : null
      })
    })
  })

  if (result.error) {
    console.error('⚠️ CLI exited with error (non-fatal):', result.error)
    // Still return 200 so Vercel doesn't mark cron as failed
    return res.status(200).json({ 
      success: false, 
      error: result.error,
      stdout: result.stdout.slice(-2000), // last 2000 chars
      timestamp: new Date().toISOString() 
    })
  }

  return res.status(200).json({ success: true, timestamp: new Date().toISOString() })
}
