export type TwitterAuthMode = 'oauth1-user' | 'none'

// The funded consumer-key app is the only approved automatic X connection.
// Unrelated OAuth2 refresh credentials must never take priority or be retried.
export function twitterAuthMode(env: NodeJS.ProcessEnv = process.env): TwitterAuthMode {
  const accessSecret = env.TWITTER_ACCESS_TOKEN_SECRET?.trim() || env.TWITTER_ACCESS_SECRET?.trim()
  if (env.TWITTER_API_KEY?.trim() && env.TWITTER_API_SECRET?.trim() && env.TWITTER_ACCESS_TOKEN?.trim() && accessSecret) return 'oauth1-user'
  return 'none'
}
