import { v2 as cloudinary } from 'cloudinary'

function configureCloudinary(): void {
  // Trim all values — trailing spaces/newlines in env vars cause Invalid Signature
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not set. Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in env vars.')
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
}

export async function uploadVideoToCloudinary(videoUrl: string): Promise<string> {
  configureCloudinary()

  console.log('☁️  Uploading video to Cloudinary:', videoUrl)

  const result = await cloudinary.uploader.upload(videoUrl, {
    resource_type: 'video',
    public_id: `nws_video_${Date.now()}`,
    overwrite: true,
  })

  console.log('✅ Cloudinary upload complete:', result.secure_url)
  return result.secure_url
}

/**
 * Upload a local video file (e.g. an ffmpeg-composited render) to Cloudinary.
 */
export async function uploadLocalVideoToCloudinary(filePath: string, opts?: { publicIdPrefix?: string }): Promise<string> {
  configureCloudinary()

  const prefix = (opts?.publicIdPrefix || 'nws_composited').replace(/[^a-zA-Z0-9_]/g, '_')
  console.log('☁️  Uploading local video to Cloudinary:', filePath)

  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: 'video',
    public_id: `${prefix}_${Date.now()}`,
    overwrite: true,
    chunk_size: 6_000_000,
  })

  console.log('✅ Cloudinary upload complete:', result.secure_url)
  return result.secure_url
}
