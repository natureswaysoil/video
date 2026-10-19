export function marketingReceipt(jobId: string, campaignId: string, platforms: string[], success: Record<string, boolean>, skipped: Set<string>, ids: Record<string, string>) {
  const idKeys: Record<string, string> = {
    youtube: 'youtubeId',
    instagram: 'instagramId',
    facebook: 'facebookId',
    twitter: 'twitterId',
    tiktok: 'tiktokPostIds'
  }
  const channels = Object.fromEntries(platforms.map(channel => {
    let postId = ids[idKeys[channel]]
    if (channel === 'facebook_groups') {
      postId = Object.entries(ids)
        .filter(([key, value]) => key.startsWith('facebookGroup_') && !!value)
        .map(([, value]) => value).join(',')
    }
    // A remote post may exist even after a timeout. Without a returned post ID,
    // publication is unconfirmed and must not be reported as successful.
    return [channel, success[channel] && postId
      ? { status: 'published', postId }
      : { status: skipped.has(channel) ? 'skipped' : 'unconfirmed' }]
  }))
  return { schemaVersion: 1, jobId, campaignId, channels }
}
