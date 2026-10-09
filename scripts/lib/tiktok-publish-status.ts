type PublishStatus = { status?: string, fail_reason?: string, publicaly_available_post_id?: Array<string | number> }

export async function waitForTikTokPublish(
  publishId: string,
  fetchStatus: () => Promise<PublishStatus>,
  options: { attempts?: number, sleep?: () => Promise<void> } = {}
) {
  const attempts = options.attempts ?? 30
  const sleep = options.sleep ?? (() => new Promise<void>(resolve => setTimeout(resolve, 10000)))
  for (let i = 0; i < attempts; i++) {
    const result = await fetchStatus()
    if (result.status === 'PUBLISH_COMPLETE') {
      return { platform: 'tiktok', publishId, status: result.status, postIds: (result.publicaly_available_post_id || []).map(String) }
    }
    if (result.status === 'FAILED') throw new Error(`TikTok publish ${publishId} failed: ${result.fail_reason || 'unknown reason'}`)
    if (i + 1 < attempts) await sleep()
  }
  throw new Error(`TikTok publish ${publishId} is still pending; publication has not been confirmed`)
}
