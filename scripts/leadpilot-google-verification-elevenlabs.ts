import fs from 'node:fs/promises'
import path from 'node:path'
import { ElevenLabsClient } from '../src/elevenlabs'
import { loadSecretsToEnv } from '../src/secret-manager'

const VOICE_ID = 'PIGsltMj3gFMR34aFDI3'

const SCRIPT = `This video demonstrates how LeadPilot uses Google's Gmail read-only scope for a user-facing lead-management feature.

LeadPilot is designed for contractors who receive customer inquiries, estimate requests, and service requests by email while they are working. With the contractor's explicit authorization, LeadPilot connects to Gmail through Google OAuth and uses read-only access to identify incoming messages that may represent legitimate customer leads.

In this demonstration, the contractor starts in LeadPilot and chooses to connect Gmail. Google presents the OAuth consent flow and the Gmail read-only permission. The user must explicitly approve this permission before LeadPilot can access Gmail data.

LeadPilot uses Gmail message content only as needed to determine whether an incoming email is a customer inquiry and to extract lead-related details. Those details can include the sender's name and email address, phone number when provided, the requested service, ZIP code, requested timing, and other job information contained in the message.

This access is necessary because metadata alone is not sufficient for LeadPilot's core function. A subject line or sender address by itself often cannot determine whether an email is a real estimate request, a newsletter, a receipt, a vendor message, or another non-lead message. LeadPilot must inspect the message body to classify the inquiry and extract the information needed to create an actionable lead for the contractor.

After an inquiry is received, LeadPilot classifies it and, when appropriate, creates a lead in the contractor's dashboard. The dashboard shows that the source of the lead is Gmail and organizes the customer information for follow-up.

LeadPilot may also send a separate acknowledgement to the customer through its own email delivery provider. That acknowledgement is not sent through the Gmail API.

LeadPilot does not use Gmail access to send Gmail messages. It does not modify, delete, archive, label, or move messages in the user's mailbox. The Gmail permission is read-only and is used only to provide the lead-detection and lead-organization functionality that the contractor enabled.

LeadPilot limits its use of Google user data to providing and improving this user-facing feature. OAuth credentials are stored securely, and the contractor can disconnect Gmail from LeadPilot at any time. The user can also revoke access through Google account permissions.

LeadPilot's privacy policy explains how Google user data is accessed, used, stored, shared, retained, and deleted. LeadPilot's use of information received from Google APIs is intended to comply with the Google API Services User Data Policy, including the Limited Use requirements.

This concludes the demonstration of why LeadPilot requests Gmail read-only access, how that access is used, and why a more limited metadata-only permission would not provide the message content required for lead classification and extraction.`

async function main() {
  await loadSecretsToEnv(['ELEVENLABS_API_KEY', 'ELEVENLABS_MODEL_ID'])
  const apiKey = String(process.env.ELEVENLABS_API_KEY || '').trim()
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured in the environment or Google Secret Manager')

  const client = new ElevenLabsClient(apiKey)
  const audio = await client.createVoiceover({ text: SCRIPT, voiceId: VOICE_ID })

  const outputDir = path.resolve(process.cwd(), 'output/leadpilot')
  await fs.mkdir(outputDir, { recursive: true })
  const audioPath = path.join(outputDir, 'google-verification-elevenlabs.mp3')
  const scriptPath = path.join(outputDir, 'google-verification-elevenlabs-script.txt')
  await fs.writeFile(audioPath, audio)
  await fs.writeFile(scriptPath, SCRIPT, 'utf8')
  console.log(`Saved ElevenLabs narration to ${audioPath}`)
  console.log(`Saved generic verification script to ${scriptPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
