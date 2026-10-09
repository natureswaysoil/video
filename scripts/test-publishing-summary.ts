import assert from 'node:assert/strict'
import { publishingSummary } from './lib/publishing-summary'

const summary = publishingSummary('product-1', ['youtube', 'tiktok', 'twitter', 'facebook_groups'],
  { youtube: true, tiktok: false, twitter: false, facebook_groups: true },
  { tiktok: 'Missing TIKTOK_ACCESS_TOKEN', twitter: 'HTTP 402 | payment required\nretry later', facebook_groups: 'group-2: API failure' },
  new Set(['tiktok']),
  { youtubeId: 'yt-1', twitterId: 'tweet-1', twitterMediaId: 'media-1', tiktokPublishId: 'publish-1', facebookGroup_group1: 'group-post-1' })
assert(summary.includes('| youtube | Posted |'))
assert(summary.includes('| tiktok | Skipped | Missing TIKTOK_ACCESS_TOKEN |'))
assert(summary.includes('| twitter | Failed | HTTP 402 \\| payment required retry later |'))
assert(summary.includes('| facebook_groups | Partial | group-2: API failure |'))
for (const id of ['yt-1', 'tweet-1', 'media-1', 'publish-1', 'group-post-1']) assert(summary.includes(id), `Missing confirmed ID: ${id}`)
console.log('Publishing summary statuses, failure details, table escaping, and IDs tests passed')
