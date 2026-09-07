import fs from 'node:fs/promises'
import path from 'node:path'
import axios from 'axios'
import { loadSecretsToEnv } from '../src/secret-manager'

const SCRIPT = `This video demonstrates how LeadPilot uses the Google Gmail read-only scope for a user-facing lead-management feature.

LeadPilot is designed for landscaping and lawn-care contractors. Contractors often receive estimate requests and service inquiries by email while they are out working. With the contractor's explicit authorization, LeadPilot connects to Gmail through Google OAuth and uses read-only access to identify incoming messages that may represent legitimate customer leads.

In this demonstration, the contractor starts in LeadPilot and chooses to connect Gmail. Google then presents the OAuth consent flow and the Gmail read-only permission. The user must explicitly approve this permission before LeadPilot can access Gmail data.

LeadPilot uses Gmail message content only as needed to determine whether an incoming email is a customer inquiry and to extract lead-related details. Those details can include the sender's name and email address, phone number when provided, the requested service, ZIP code, timing, and other job information contained in the message.

This access is necessary because metadata alone is not sufficient for LeadPilot's core function. A subject line or sender address by itself often cannot determine whether an email is a real estimate request, a newsletter, a receipt, a vendor message, or another non-lead message. LeadPilot must inspect the message body to classify the inquiry and extract the information needed to create an actionable lead for the contractor.

After an inquiry is received, LeadPilot classifies it and, when appropriate, creates a lead in the contractor's dashboard. The dashboard shows that the source of the lead is Gmail and organizes the customer information for follow-up. LeadPilot may also send a separate acknowledgement to the customer through its own email delivery provider. That acknowledgement is not sent through the Gmail API.

LeadPilot does not use Gmail access to send Gmail messages. It does not modify, delete, archive, label, or move messages in the user's mailbox. The Gmail permission is read-only and is used only to provide the lead-detection and lead-organization functionality that the contractor has enabled.

LeadPilot limits its use of Google user data to providing and improving this user-facing feature. OAuth credentials are stored securely, and the contractor can disconnect Gmail from LeadPilot. The user can also revoke access through their Google account permissions.

LeadPilot's privacy policy explains how Google user data is accessed, used, stored, shared, retained, and deleted. LeadPilot's use of information received from Google APIs is intended to comply with the Google API Services User Data Policy, including the Limited Use requirements.

This concludes the demonstration of why LeadPilot requests Gmail read-only access, how that access is used, and why a more limited metadata-only permission would not provide the message content required for lead classification and extraction.`

async function main() {
  await loadSecretsToEnv(['HEYGEN_API_KEY', 'HEYGEN_DEFAULT_AVATAR', 'HEYGEN_DEFAULT_VOICE'])

  const apiKey = String(process.env.HEYGEN_API_KEY || '').trim()
  const avatarId = String(process.env.HEYGEN_DEFAULT_AVATAR || '').trim()
  const voiceId = String(process.env.HEYGEN_DEFAULT_VOICE || '').trim()
  if (!apiKey) throw new Error('HEYGEN_API_KEY is not configured')
  if (!avatarId) throw new Error('HEYGEN_DEFAULT_AVATAR is not configured')
  if (!voiceId) throw new Error('HEYGEN_DEFAULT_VOICE is not configured')

  const client = axios.create({
    baseURL: process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    timeout: 60_000,
  })

  const create = await client.post('/v2/video/generate', {
    video_inputs: [{
      character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
      voice: { type: 'text', input_text: SCRIPT, voice_id: voiceId, speed: 1.0 },
      background: { type: 'color', value: '#F4F7F5' },
    }],
    dimension: { width: 1280, height: 720 },
    caption: false,
    title: 'LeadPilot Google Verification Narration',
  })

  const videoId = create.data?.data?.video_id || create.data?.video_id
  if (!videoId) throw new Error(`HeyGen did not return a video ID: ${JSON.stringify(create.data)}`)
  console.log(`Created HeyGen verification narration video: ${videoId}`)

  const started = Date.now()
  let videoUrl = ''
  while (Date.now() - started < 30 * 60_000) {
    const statusRes = await client.get('/v1/video_status.get', { params: { video_id: videoId } })
    const data = statusRes.data?.data || statusRes.data || {}
    const status = String(data.status || '').toLowerCase()
    console.log(`HeyGen status: ${status || 'unknown'}`)
    if (status === 'completed' || status === 'success') {
      videoUrl = String(data.video_url || data.captioned_video_url || data.url || '')
      if (videoUrl) break
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`HeyGen job failed: ${data.error || data.error_message || data.failure_message || 'unknown error'}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000))
  }
  if (!videoUrl) throw new Error('HeyGen verification narration timed out')

  const outputDir = path.resolve(process.cwd(), 'output/leadpilot')
  await fs.mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'google-verification-heygen-narration.mp4')
  const download = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120_000 })
  await fs.writeFile(outputPath, Buffer.from(download.data))
  console.log(`Saved ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
