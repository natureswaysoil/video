import axios from 'axios'

export type ElevenLabsVoiceoverOptions = {
  text: string
  voiceId?: string
  modelId?: string
}

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

export class ElevenLabsClient {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(apiKey: string, baseUrl = process.env.ELEVENLABS_API_ENDPOINT || 'https://api.elevenlabs.io') {
    this.apiKey = String(apiKey || '').trim()
    this.baseUrl = baseUrl
    if (!this.apiKey) throw new Error('ELEVENLABS_API_KEY is not configured')
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      'xi-api-key': this.apiKey,
      ...extra,
    }
  }

  async resolveVoiceId(requested?: string): Promise<string> {
    const configured = String(requested || process.env.ELEVENLABS_VOICE_ID || '').trim()
    if (configured) return configured

    // Use ElevenLabs' documented Rachel voice by default. This avoids requiring
    // the deprecated list-voices endpoint, which can reject some newer accounts.
    return DEFAULT_VOICE_ID
  }

  async createVoiceover(options: ElevenLabsVoiceoverOptions): Promise<Buffer> {
    const text = String(options.text || '').trim()
    if (!text) throw new Error('Voiceover text is required')

    const voiceId = await this.resolveVoiceId(options.voiceId)
    const modelId = String(options.modelId || process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2').trim()

    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
        {
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.1,
            use_speaker_boost: true,
          },
        },
        {
          headers: this.headers({
            Accept: 'audio/mpeg',
            'Content-Type': 'application/json',
          }),
          responseType: 'arraybuffer',
          timeout: 120_000,
        },
      )
      return Buffer.from(response.data)
    } catch (error: any) {
      const status = error?.response?.status
      const message = error?.response?.data
        ? Buffer.isBuffer(error.response.data)
          ? error.response.data.toString('utf8').slice(0, 500)
          : JSON.stringify(error.response.data).slice(0, 500)
        : String(error?.message || error)
      throw new Error(`ElevenLabs voiceover failed${status ? ` (${status})` : ''}: ${message}`)
    }
  }
}
