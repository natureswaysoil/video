export function marketingReceipt(jobId: string, campaignId: string, platforms: string[], success: Record<string, boolean>, skipped: Set<string>, ids: Record<string, string>) {
  const idKeys: Record<string, string> = { youtube: 'youtubeId', instagram: 'instagramId', facebook: 'facebookId', twitter: 'twitterId' }
  return { schemaVersion: 1, jobId, campaignId, channels: Object.fromEntries(platforms.map(channel => {
    const postId = ids[idKeys[channel]]
    // A failed request can still have published remotely. Missing IDs stay unconfirmed.
    return [channel, success[channel] && postId ? { status: 'published', postId } : { status: skipped.has(channel) ? 'skipped' : 'unconfirmed' }]
  })) }
}
