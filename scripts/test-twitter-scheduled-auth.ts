import assert from 'assert'
import { twitterAuthMode } from './lib/twitter-auth'

assert.equal(twitterAuthMode({
  TWITTER_CLIENT_ID: 'client-id',
  TWITTER_CLIENT_SECRET: 'client-secret',
  TWITTER_REFRESH_TOKEN: 'refresh-token',
  TWITTER_API_KEY: 'api-key',
  TWITTER_API_SECRET: 'api-secret',
  TWITTER_ACCESS_TOKEN: 'access-token',
  TWITTER_ACCESS_SECRET: 'access-secret'
}), 'oauth2-user', 'OAuth 2.0 refresh credentials must take priority')

assert.equal(twitterAuthMode({
  TWITTER_API_KEY: 'api-key',
  TWITTER_API_SECRET: 'api-secret',
  TWITTER_ACCESS_TOKEN: 'access-token',
  TWITTER_ACCESS_TOKEN_SECRET: 'access-secret'
}), 'oauth1-user', 'OAuth 1.0a must remain available as a fallback')

assert.equal(twitterAuthMode({
  TWITTER_CLIENT_ID: 'client-id',
  TWITTER_CLIENT_SECRET: 'client-secret'
}), 'none', 'Incomplete OAuth 2.0 credentials must not be treated as usable')

console.log('Scheduled Twitter authentication tests passed')
