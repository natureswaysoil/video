import type { VercelRequest, VercelResponse } from '@vercel/node'
import { execFile } from 'child_process'
import path from 'path'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('🕐 Cron triggered at', new Date().toISOString())

  try {
    const cliPath = path.join(process.cwd(), 'dist', 'cli.js')
    await new Promise<void>((resolve, reject) => {
      execFile('node', [cliPath], {
        timeout: 240000,
        env: process.env,
      }, (error, stdout, stderr) => {
        if (stdout) console.log(stdout)
        if (stderr) console.error(stderr)
        if (error) reject(error)
        else resolve()
      })
    })
    return res.status(200).json({ success: true, timestamp: new Date().toISOString() })
  } catch (err: any) {
    console.error('❌ Cron job failed:', err?.message)
    return res.status(500).json({ error: err?.message })
  }
}
