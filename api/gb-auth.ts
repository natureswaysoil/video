import type { VercelRequest, VercelResponse } from '@vercel/node'
import axios from 'axios'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
  const REDIRECT_URI = 'https://video-gilt-eta.vercel.app/api/gb-auth'

  // Step 1: No code yet — redirect to Google OAuth
  if (!req.query.code) {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('https://www.googleapis.com/auth/business.manage')}` +
      `&access_type=offline` +
      `&prompt=consent`
    return res.redirect(authUrl)
  }

  // Step 2: Got code — exchange for tokens
  try {
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code: req.query.code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    })

    const { access_token, refresh_token } = tokenRes.data

    // Step 3: Get account and location IDs
    const accountsRes = await axios.get(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: { Authorization: `Bearer ${access_token}` } }
    )

    const accounts = accountsRes.data.accounts || []
    let locations: any[] = []

    for (const account of accounts) {
      try {
        const locRes = await axios.get(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        )
        const locs = (locRes.data.locations || []).map((l: any) => ({
          ...l,
          accountName: account.name
        }))
        locations = [...locations, ...locs]
      } catch {}
    }

    return res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px;max-width:700px">
        <h2>✅ Google Business Profile Connected!</h2>
        <p>Add these to your <a href="https://vercel.com/james-projects-5e9a58a0/video/settings/environment-variables" target="_blank">Vercel env vars</a>:</p>
        
        <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%">
          <tr style="background:#f0f0f0"><th>Variable</th><th>Value</th></tr>
          <tr><td>GOOGLE_BUSINESS_ACCESS_TOKEN</td><td style="font-size:11px;word-break:break-all">${access_token}</td></tr>
          <tr><td>GOOGLE_BUSINESS_REFRESH_TOKEN</td><td style="font-size:11px;word-break:break-all">${refresh_token || '(none - re-authorize)'}</td></tr>
          ${accounts.map((a: any) => `<tr><td>GOOGLE_BUSINESS_ACCOUNT_ID</td><td>${a.name}</td></tr>`).join('')}
          ${locations.map((l: any) => `<tr><td>GOOGLE_BUSINESS_LOCATION_ID</td><td>${l.name} (${l.title})</td></tr>`).join('')}
        </table>

        <br>
        <p style="color:orange">⚠️ Access token expires in 1 hour. Use the refresh token to get new ones automatically.</p>
        <p>After adding env vars, hit the cron to start posting: <a href="https://video-gilt-eta.vercel.app/api/cron">https://video-gilt-eta.vercel.app/api/cron</a></p>
      </body></html>
    `)
  } catch (err: any) {
    return res.status(500).json({
      error: 'Auth failed',
      details: err?.response?.data || err?.message
    })
  }
}
