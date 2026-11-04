import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import childProcess = require('child_process')
import { Speech } from 'openai/resources/audio/speech'
import { ElevenLabsClient } from '../src/elevenlabs'
import * as secrets from '../src/secret-manager'
import { createNarration } from './lib/video-provider'

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'narration-test-'))
  const env = { ...process.env }
  const originalSpeech = Speech.prototype.create
  const originalElevenLabs = ElevenLabsClient.prototype.createVoiceover
  const originalLoadSecrets = secrets.loadSecretsToEnv
  const originalExec = childProcess.execFileSync
  const script = 'Feed the soil for stronger roots.'
  const audio = Buffer.from('mock speech audio')
  let openaiCalls = 0
  let fallbackCalls = 0
  let normalizationCalls = 0
  let openaiError = ''
  let fallbackError = ''
  let emptyOpenai = false
  let emptyFallback = false
  let normalizationError = false
  let fallbackConfigured = true
  const run = () => createNarration({ id: 'test' }, { fullVoiceover: script }, {}, dir)

  try {
    process.env.OPENAI_API_KEY = 'test-key'
    delete process.env.ELEVENLABS_API_KEY
    Speech.prototype.create = (async (input: any) => {
      openaiCalls++
      assert.equal(input.input, script)
      if (openaiError) throw new Error(openaiError)
      return { arrayBuffer: async () => emptyOpenai ? Buffer.alloc(0) : audio }
    }) as any
    ElevenLabsClient.prototype.createVoiceover = async (input) => {
      fallbackCalls++
      assert.equal(input.text, script)
      if (fallbackError) throw new Error(fallbackError)
      return emptyFallback ? Buffer.alloc(0) : audio
    }
    ;(secrets as any).loadSecretsToEnv = async (names: string[]) => {
      assert.deepEqual(names, ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL_ID'])
      if (fallbackConfigured) process.env.ELEVENLABS_API_KEY = 'test-key'
    }
    ;(childProcess as any).execFileSync = (command: string, args: string[]) => {
      normalizationCalls++
      assert.equal(command, 'ffmpeg')
      if (normalizationError) throw new Error('normalization failed')
      const input = args[args.indexOf('-i') + 1]
      assert.deepEqual(fs.readFileSync(input), audio)
      fs.writeFileSync(args[args.length - 1], audio)
    }

    assert.match(await run(), /\.m4a$/)
    assert.equal(openaiCalls, 1)
    assert.equal(fallbackCalls, 0, 'OpenAI success must not call the fallback')

    openaiError = '429 You have no credits remaining'
    assert.match(await run(), /\.m4a$/)
    assert.equal(fallbackCalls, 1, 'Quota exhaustion must use ElevenLabs narration')

    delete process.env.OPENAI_API_KEY
    assert.match(await run(), /\.m4a$/)
    assert.equal(openaiCalls, 2, 'Missing OpenAI credentials must use the fallback directly')

    process.env.OPENAI_API_KEY = 'test-key'
    fallbackError = 'provider unavailable'
    const rendersBefore = normalizationCalls
    await assert.rejects(run, /refusing to render without audio.*429.*provider unavailable/)
    assert.equal(normalizationCalls, rendersBefore, 'Provider failures must stop before rendering')

    fallbackConfigured = false
    delete process.env.ELEVENLABS_API_KEY
    await assert.rejects(run, /ELEVENLABS_API_KEY is not configured/)
    fallbackConfigured = true

    fallbackError = ''
    openaiError = ''
    emptyOpenai = true
    assert.match(await run(), /\.m4a$/)
    emptyFallback = true
    await assert.rejects(run, /TTS produced no output/)
    emptyFallback = false
    emptyOpenai = false

    normalizationError = true
    const raw = await run()
    assert.match(raw, /\.mp3$/)
    assert.deepEqual(fs.readFileSync(raw), audio)

    await assert.rejects(
      () => createNarration({ id: 'empty' }, { scenes: [] }, {}, dir),
      /non-empty script/
    )
    console.log('Narration fallback regression tests passed')
  } finally {
    Speech.prototype.create = originalSpeech
    ElevenLabsClient.prototype.createVoiceover = originalElevenLabs
    ;(secrets as any).loadSecretsToEnv = originalLoadSecrets
    ;(childProcess as any).execFileSync = originalExec
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]
    Object.assign(process.env, env)
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
