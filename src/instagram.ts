import axios from 'axios'

type StatusCode = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'

interface PostOptions {
  mediaType?: 'VIDEO' | 'REELS' | 'STORIES'
  uploadType?: 'simple' | 'resumable'
  apiVersion?: string
  apiHost?: string // graph.facebook.com or graph.instagram.com
}

export async function postToInstagram(
  videoUrl: string,
  caption: string,
  accessToken: string,
  igId: string,
  opts: PostOptions = {}
) {
  const apiVersion = opts.apiVersion || process.env.INSTAGRAM_API_VERSION || 'v19.0'
  const apiHost = opts.apiHost || process.env.INSTAGRAM_API_HOST || 'graph.facebook.com'
  const mediaType = (opts.mediaType || (process.env.IG_MEDIA_TYPE as any) || 'REELS') as PostOptions['mediaType']
  const uploadType = (opts.uploadType || (process.env.IG_UPLOAD_TYPE as any) || 'simple') as PostOptions['uploadType']

  // Step 1: Create media container
  const baseUrl = `https://${apiHost}/${apiVersion}`

  let containerId: string | undefined

  try {
    if (uploadType === 'resumable') {
      // Create a resumable upload container (no video_url here)
      const containerRes = await axios.post(
        `${baseUrl}/${igId}/media`,
        {
          media_type: mediaType || 'VIDEO',
          caption,
          upload_type: 'resumable',
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )
      const cid = containerRes.data.id as string
      containerId = cid
      // Upload the video using rupload with file_url header
      await uploadViaRupload(cid, videoUrl, accessToken, apiVersion)
    } else {
      // Simple path: point Instagram to a public video URL
      const containerRes = await axios.post(
        `${baseUrl}/${igId}/media`,
        {
          video_url: videoUrl,
          media_type: mediaType || 'VIDEO',
          caption,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )
      containerId = containerRes.data.id
    }
  } catch (err: any) {
    // If resumable is not allowed (e.g., app setup), fallback to simple method once
    const msg = err?.response?.data || err?.message || String(err)
    if (uploadType === 'resumable') {
      // Fallback to simple flow
      const containerRes = await axios.post(
        `${baseUrl}/${igId}/media`,
        {
          video_url: videoUrl,
          media_type: mediaType || 'VIDEO',
          caption,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )
      containerId = containerRes.data.id
    } else {
      throw new Error(`Instagram container creation failed: ${JSON.stringify(msg)}`)
    }
  }

  if (!containerId) throw new Error('Instagram: missing containerId')

  // Optional: poll container status before publishing (recommended)
  const status = await pollContainerStatus({
    containerId,
    accessToken,
    apiHost,
    apiVersion,
    maxAttempts: 6,
    delayMs: 10000,
  })
  if (status === 'ERROR') {
    throw new Error('Instagram: container status ERROR before publish')
  }

  // Step 2: Publish media container
  const publishRes = await axios.post(
    `${baseUrl}/${igId}/media_publish`,
    { creation_id: containerId },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  return publishRes.data.id
}

async function pollContainerStatus(params: {
  containerId: string
  accessToken: string
  apiVersion: string
  apiHost: string
  maxAttempts?: number
  delayMs?: number
}): Promise<StatusCode | undefined> {
  const { containerId, accessToken, apiVersion, apiHost } = params
  const maxAttempts = params.maxAttempts ?? 6
  const delayMs = params.delayMs ?? 10000
  const baseUrl = `https://${apiHost}/${apiVersion}`
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await axios.get(`${baseUrl}/${containerId}?fields=status_code`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const status = res.data?.status_code as StatusCode | undefined
      if (!status) return undefined
      if (status === 'FINISHED' || status === 'PUBLISHED') return status
      if (status === 'ERROR' || status === 'EXPIRED') return status
    } catch (e) {
      // Ignore transient errors and retry
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return undefined
}

async function uploadViaRupload(containerId: string, videoUrl: string, accessToken: string, apiVersion: string) {
  const ruploadUrl = `https://rupload.facebook.com/ig-api-upload/${apiVersion}/${containerId}`
  // Use file_url header to instruct Meta to fetch the video from our URL
  await axios.post(
    ruploadUrl,
    undefined,
    {
      headers: {
        Authorization: `OAuth ${accessToken}`,
        'file_url': videoUrl,
      },
      // Avoid axios adding content-type when no body
      validateStatus: (s) => s >= 200 && s < 300,
    }
  )
}