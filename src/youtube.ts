import { google } from 'googleapis'
import axios from 'axios'
import type { Readable } from 'stream'

export async function postToYouTube(
  videoUrl: string,
  caption: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  privacyStatus: 'public' | 'unlisted' | 'private' = 'unlisted',
): Promise<string> {
  const oauth2Client = new google.auth.OAuth2({ clientId, clientSecret })
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client })

  // Stream the video from the remote URL to YouTube
  const res = await axios.get<Readable>(videoUrl, { responseType: 'stream' })
  const mediaBody = res.data as unknown as Readable

  const title = caption?.slice(0, 95) || 'Video'
  const description = caption || ''

  const upload = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description, categoryId: '22' }, // People & Blogs default
      status: { privacyStatus },
    },
    media: { body: mediaBody },
  })

  const videoId = upload.data.id
  if (!videoId) throw new Error('YouTube upload did not return a video ID')
  return videoId
}
