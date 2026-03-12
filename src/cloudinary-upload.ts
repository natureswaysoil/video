import { v2 as cloudinary } from 'cloudinary'

export async function uploadVideoToCloudinary(videoUrl: string): Promise<string> {
  // Trim all values — trailing spaces/newlines in env vars cause Invalid Signature
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not set. Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in env vars.')
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })

  console.log('☁️  Uploading video to Cloudinary:', videoUrl)

  const result = await cloudinary.uploader.upload(videoUrl, {
    resource_type: 'video',
    public_id: `nws_video_${Date.now()}`,
    overwrite: true,
  })

  console.log('✅ Cloudinary upload complete:', result.secure_url)
  return result.secure_url
}
