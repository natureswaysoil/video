#!/usr/bin/env ts-node
import { createClientWithSecrets } from '../src/pictory'

async function main() {
  const client = await createClientWithSecrets()
  const token = await client.getAccessToken()
  console.log('Got access token: %s', token ? 'yes' : 'no')

  // Example storyboard payload. Adjust to match Pictory API.
  const storyboardPayload = {
    title: 'Test storyboard',
    scenes: [
      { type: 'text', text: 'Hello from Pictory client' },
    ],
  }

  console.log('Creating storyboard...')
  const sbJobId = await client.createStoryboard(token, storyboardPayload)
  console.log('Storyboard job id:', sbJobId)

  console.log('Polling for render params...')
  const renderParams = await client.pollJobForRenderParams(sbJobId, token)
  console.log('Render params available:', !!renderParams)

  console.log('Requesting render...')
  const renderJobId = await client.renderVideo(token, sbJobId)
  console.log('Render job id:', renderJobId)

  console.log('Waiting for render to complete...')
  const result = await client.pollRenderJob(renderJobId, token)
  console.log('Render completed:', result)
}

main().catch((err) => {
  // In a runner tool we want full stack traces for debugging
  console.error('Runner failed:', err)
  process.exit(1)
})
