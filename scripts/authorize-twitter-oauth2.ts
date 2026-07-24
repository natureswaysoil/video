import http from 'http'
import { URL } from 'url'
import { TwitterApi } from 'twitter-api-v2'
import { loadSecretsToEnv, addSecretVersion } from '../src/secret-manager'

const callbackUrl = 'http://127.0.0.1:3001/callback'

async function main() {
  await loadSecretsToEnv(['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'])

  const clientId = process.env.TWITTER_CLIENT_ID?.trim()
  const clientSecret = process.env.TWITTER_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    throw new Error('TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET are required')
  }

  const requestClient = new TwitterApi({ clientId, clientSecret })
  const auth = requestClient.generateOAuth2AuthLink(callbackUrl, {
    scope: ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'],
  })

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', callbackUrl)
      if (requestUrl.pathname !== '/callback') {
        response.writeHead(404).end('Not found')
        return
      }

      const code = requestUrl.searchParams.get('code')
      const state = requestUrl.searchParams.get('state')
      if (!code || state !== auth.state) {
        response.writeHead(400, { 'Content-Type': 'text/plain' })
        response.end('Authorization failed: missing code or invalid state.')
        return
      }

      const result = await requestClient.loginWithOAuth2({
        code,
        codeVerifier: auth.codeVerifier,
        redirectUri: callbackUrl,
      })
      if (!result.refreshToken) {
        throw new Error('X did not return a refresh token. Ensure offline.access is authorized.')
      }

      await addSecretVersion('TWITTER_REFRESH_TOKEN', result.refreshToken)
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end('X authorization complete. The refresh token was stored securely. You may close this tab.')
      console.log('Authorization complete; TWITTER_REFRESH_TOKEN was stored securely.')
      server.close()
    } catch (error: any) {
      response.writeHead(500, { 'Content-Type': 'text/plain' })
      response.end(`Authorization failed: ${error?.message || error}`)
      console.error(error)
      server.close()
      process.exitCode = 1
    }
  })

  server.listen(3001, '127.0.0.1', () => {
    console.log(`OPEN_THIS_URL=${auth.url}`)
  })

  setTimeout(() => {
    console.error('Authorization timed out after 10 minutes.')
    server.close()
    process.exitCode = 1
  }, 10 * 60_000).unref()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
