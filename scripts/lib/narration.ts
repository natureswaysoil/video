// @ts-nocheck
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import { execFileSync } from 'child_process'
import { ElevenLabsClient } from '../../src/elevenlabs'
import { loadSecretsToEnv } from '../../src/secret-manager'
import { ensureDir, safeFileName } from './video-utils'

/**
 * Generate a voiceover using OpenAI TTS, with a configured ElevenLabs fallback.
 */
export async function generateVoiceover(product: any, scenePlan: any, profile: any, outDir: string): Promise<string> {
  const script = (scenePlan?.fullVoiceover || (scenePlan?.scenes || []).map((s: any) => s.voiceover).filter(Boolean).join(' ') || '').trim()
  if (!script) {
    throw new Error('Narration requires a non-empty script')
  }

  ensureDir(outDir)
  const ttsMp3 = path.resolve(outDir, `tts-${safeFileName(product.id || product.name, 'mp3')}`)
  const audioOut = path.resolve(outDir, `voiceover-${safeFileName(product.id || product.name, 'm4a')}`)

  let buffer: Buffer | undefined
  const failures: string[] = []
  if (process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const model = process.env.TTS_MODEL || 'gpt-4o-mini-tts'
      const voice = process.env.TTS_VOICE || 'alloy'
      const response = await client.audio.speech.create({
        model,
        voice: voice as any,
        input: script,
        format: 'mp3'
      } as any)
      buffer = Buffer.from(await response.arrayBuffer())
      if (!buffer.length) throw new Error('TTS produced no output')
    } catch (error: any) {
      failures.push(`OpenAI: ${error?.message || error}`)
      console.warn('OpenAI narration unavailable; trying ElevenLabs')
    }
  } else {
    failures.push('OPENAI_API_KEY is not configured')
  }

  if (!buffer?.length) {
    try {
      await loadSecretsToEnv(['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL_ID'])
      const client = new ElevenLabsClient(process.env.ELEVENLABS_API_KEY || '')
      buffer = await client.createVoiceover({ text: script })
      if (!buffer.length) throw new Error('TTS produced no output')
    } catch (error: any) {
      failures.push(`ElevenLabs: ${error?.message || error}`)
      throw new Error(`Narration generation failed; refusing to render without audio. ${failures.join('; ')}`)
    }
  }

  fs.writeFileSync(ttsMp3, buffer)
  try {
    execFileSync('ffmpeg', [
      '-y', '-nostdin', '-loglevel', 'error',
      '-i', ttsMp3,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:a', 'aac', '-b:a', '192k', audioOut
    ], { stdio: 'inherit' })
    if (fs.existsSync(audioOut) && fs.statSync(audioOut).size > 0) {
      console.log('Narration ready', { audioOut })
      try { fs.unlinkSync(ttsMp3) } catch {}
      return audioOut
    }
  } catch (error: any) {
    console.warn('Narration normalization failed; using raw mp3 output', { error: error?.message || error })
  }
  return ttsMp3
}
