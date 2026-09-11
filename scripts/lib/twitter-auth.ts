export type TwitterAuthMode = 'oauth2-user' | 'oauth1-user' | 'none'

export function twitterAuthMode(env: NodeJS.ProcessEnv = process.env): TwitterAuthMode {
  if (env.TWITTER_CLIENT_ID?.trim() && env.TWITTER_CLIENT_SECRET?.trim() && env.TWITTER_REFRESH_TOKEN?.trim()) {
    return 'oauth2-user'
  }

  const accessSecret = env.TWITTER_ACCESS_TOKEN_SECRET?.trim() || env.TWITTER_ACCESS_SECRET?.trim()
  if (env.TWITTER_API_KEY?.trim() && env.TWITTER_API_SECRET?.trim() && env.TWITTER_ACCESS_TOKEN?.trim() && accessSecret) {
    return 'oauth1-user'
  }

  return 'none'
}
