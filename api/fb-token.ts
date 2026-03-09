import type { VercelRequest, VercelResponse } from '@vercel/node'
import axios from 'axios'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { short_token } = req.query

  if (!short_token) {
    return res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px;max-width:600px">
        <h2>Facebook Token Exchange</h2>
        <p>1. Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank">Graph API Explorer</a></p>
        <p>2. Select your app, generate a User Token with <b>pages_manage_posts</b> + <b>publish_video</b> permissions</p>
        <p>3. Come back and append it to this URL:<br>
        <code>?short_token=PASTE_TOKEN_HERE</code></p>
      </body></html>
    `)
  }

  const APP_ID = process.env.FACEBOOK_APP_ID
  const APP_SECRET = process.env.FACEBOOK_APP_SECRET

  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({ error: 'FACEBOOK_APP_ID or FACEBOOK_APP_SECRET not set in Vercel env vars' })
  }

  try {
    // Step 1: Exchange for long-lived user token
    console.log('Step 1: Getting long-lived user token...')
    const longTokenRes = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: APP_ID,
        client_secret: APP_SECRET,
        fb_exchange_token: short_token,
      }
    })
    const longToken = longTokenRes.data.access_token
    console.log('Long-lived token obtained:', longToken.substring(0, 20) + '...')

    // Step 2: Get permanent page token
    console.log('Step 2: Getting permanent page token...')
    const pagesRes = await axios.get(`https://graph.facebook.com/v19.0/me/accounts`, {
      params: { access_token: longToken }
    })

    const pages = pagesRes.data.data || []
    const page = pages.find((p: any) => p.id === '61555816859969')

    if (!page) {
      return res.status(404).json({
        error: 'Page 61555816859969 not found',
        pages_found: pages.map((p: any) => ({ id: p.id, name: p.name }))
      })
    }

    const permanentToken = page.access_token
    console.log('✅ Permanent page token obtained!')

    return res.status(200).send(`
      <html><body style="font-family:sans-serif;padding:40px;max-width:800px">
        <h2>✅ Success! Permanent Page Token Generated</h2>
        <p><b>Page:</b> ${page.name} (${page.id})</p>
        <p><b>Now add this to Vercel env var FACEBOOK_PAGE_ACCESS_TOKEN:</b></p>
        <textarea style="width:100%;height:120px;font-size:12px;padding:10px">${permanentToken}</textarea>
        <br><br>
        <p style="color:green">✅ This token never expires (as long as your app remains active)</p>
      </body></html>
    `)

  } catch (err: any) {
    const errData = err?.response?.data || err?.message
    console.error('Token exchange failed:', JSON.stringify(errData))
    return res.status(500).json({ 
      error: 'Token exchange failed', 
      details: errData,
      tip: 'Make sure FACEBOOK_APP_ID and FACEBOOK_APP_SECRET match the app that generated your short token'
    })
  }
}
