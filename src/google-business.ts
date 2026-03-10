import axios from 'axios'

/**
 * Post to Google Business Profile
 * Requires: GOOGLE_BUSINESS_ACCOUNT_ID, GOOGLE_BUSINESS_LOCATION_ID, GOOGLE_BUSINESS_ACCESS_TOKEN
 */
export async function postToGoogleBusiness(
  caption: string,
  videoUrl: string,
  productUrl?: string
): Promise<{ name: string }> {
  const accountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID
  const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID
  const accessToken = process.env.GOOGLE_BUSINESS_ACCESS_TOKEN

  if (!accountId || !locationId || !accessToken) {
    throw new Error('Missing Google Business Profile credentials')
  }

  // Google Business Profile post (localPost)
  const postBody = {
    languageCode: 'en-US',
    summary: caption.substring(0, 1500), // GBP max 1500 chars
    callToAction: productUrl ? {
      actionType: 'LEARN_MORE',
      url: productUrl
    } : {
      actionType: 'LEARN_MORE',
      url: 'https://natureswaysoil.com'
    },
    media: [{
      mediaFormat: 'VIDEO',
      sourceUrl: videoUrl
    }],
    topicType: 'STANDARD'
  }

  const response = await axios.post(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`,
    postBody,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  )

  return response.data
}
