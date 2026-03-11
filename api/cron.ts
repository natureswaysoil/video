import type { VercelRequest, VercelResponse } from '@vercel/node'
import { spawn } from 'child_process'
import path from 'path'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log('🕐 Cron triggered at', new Date().toISOString())

  const cliPath = path.join(process.cwd(), 'dist', 'cli.js')

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn('node', [cliPath], {
      timeout: 240000,
      env: process.env,
    })

    // Stream stdout line by line — no buffering, no overflow
    let stdoutBuf = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString()
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() || ''
      for (const line of lines) {
        if (line.trim()) console.log('[CLI]', line.slice(0, 500))
      }
    })

    let stderrBuf = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString()
      const lines = stderrBuf.split('\n')
      stderrBuf = lines.pop() || ''
      for (const line of lines) {
        if (line.trim()) console.error('[CLI ERR]', line.slice(0, 500))
      }
    })

    child.on('close', (code) => {
      if (stdoutBuf.trim()) console.log('[CLI]', stdoutBuf.slice(0, 500))
      if (stderrBuf.trim()) console.error('[CLI ERR]', stderrBuf.slice(0, 500))
      resolve(code ?? 0)
    })

    child.on('error', (err) => {
      console.error('❌ Failed to spawn CLI:', err.message)
      resolve(1)
    })
  })

  console.log('✅ Cron complete, exit code:', exitCode)
  return res.status(200).json({ success: exitCode === 0, exitCode, timestamp: new Date().toISOString() })
}
