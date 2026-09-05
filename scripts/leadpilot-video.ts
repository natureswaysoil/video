// @ts-nocheck
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { execSync } from 'child_process'
import { google } from 'googleapis'
import { Storage } from '@google-cloud/storage'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { composeVerticalAd } from './lib/ffmpeg-compositor'
import { validateMarketingVideo } from './lib/video-quality-gate'
import { fetchBrollForScene } from './lib/pexels-media'
import { ensureDir, hasUsableFile, safeFileName } from './lib/video-utils'
import { createNarration } from './lib/video-provider'

type CampaignScene = {
  name: string
  seconds: number
  voiceover: string
  caption: string
  brollQuery: string
}

type Campaign = {
  id: string
  name: string
  description: string
  hook: string
  overlayText: string
  cta: string
  brollQueries: string[]
  scenes: CampaignScene[]
}

const ROOT = process.cwd()
const CONFIG_PATH = path.resolve(ROOT, process.env.LEADPILOT_CAMPAIGNS_FILE || 'config/leadpilot-campaigns.json')
const OUTPUT_DIR = path.resolve(ROOT, 'output/leadpilot')
const TEMP_DIR = path.resolve(ROOT, 'temp-leadpilot')
const STATE_PATH = path.resolve(ROOT, process.env.LEADPILOT_STATE_FILE || 'data/leadpilot-video-state.json')
const DEFAULT_PUBLIC_VIDEO_BUCKET = 'natureswaysoil-social-videos'
const DEFAULT_LEADPILOT_URL = 'https://followupnest-git-feature-onboard-fc8b14-james-projects-5e9a58a0.vercel.app/'

const SECRET_NAMES = [
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'PEXELS_API_KEY',
  'YT_CLIENT_ID',
  'YT_CLIENT_SECRET',
  'YT_REFRESH_TOKEN',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
  'FB_PAGE_ACCESS_TOKEN',
  'FB_PAGE_ID',
  'FACEBOOK_PAGE_ACCESS_TOKEN',
  'FACEBOOK_PAGE_ID',
  'LEADPILOT_YT_CLIENT_ID',
  'LEADPILOT_YT_CLIENT_SECRET',
  'LEADPILOT_YT_REFRESH_TOKEN',
  'LEADPILOT_FB_PAGE_ACCESS_TOKEN',
  'LEADPILOT_FB_PAGE_ID',
  'GCS_PUBLIC_BUCKET',
  'VIDEO_PUBLIC_BUCKET',
  'VIDEO_PUBLIC_URL_BASE',
  'LEADPILOT_URL'
]

function log(message: string, data?: any) {
  if (data === undefined) console.log(message)
  else console.log(message, data)
}

function hasValue(name: string) {
  const value = process.env[name]?.trim()
  return Boolean(value && !/your-|your_|changeme|placeholder|paste_|replace_|dummy_|example_/i.test(value))
}

function pickEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return ''
}

function secretCandidates(name: string) {
  const upper = name.trim().replace(/[\s-]+/g, '_').toUpperCase()
  return [...new Set([upper, upper.toLowerCase().replace(/_/g, '-'), name, name.replace(/_/g, '-')])]
}

async function loadSecrets() {
  if (String(process.env.USE_SECRET_MANAGER || 'true').toLowerCase() === 'false') return
  const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true'
  const hasAdc = !!process.env.GOOGLE_APPLICATION_CREDENTIALS || !!process.env.GOOGLE_GHA_CREDS_PATH
  if (dryRun && !hasAdc) return

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'natureswaysoil-video'
  const client = new SecretManagerServiceClient()
  for (const secretName of SECRET_NAMES) {
    if (hasValue(secretName)) continue
    for (const candidate of secretCandidates(secretName)) {
      try {
        const [version] = await client.accessSecretVersion({ name: `projects/${projectId}/secrets/${candidate}/versions/latest` })
        const value = version.payload?.data?.toString().trim()
        if (value) {
          process.env[secretName] = value
          break
        }
      } catch (error: any) {
        if (Number(error?.code) === 5 || String(error?.message || '').includes('NOT_FOUND')) continue
        if (Number(error?.code) === 7 || String(error?.message || '').toUpperCase().includes('PERMISSION_DENIED')) {
          throw new Error(`Secret Manager permission denied for ${candidate}: ${error?.message || error}`)
        }
        break
      }
    }
  }
}

function readJson(file: string, fallback: any) {
  try {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: any) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function loadCampaigns(): Campaign[] {
  const raw = readJson(CONFIG_PATH, { campaigns: [] })
  return Array.isArray(raw.campaigns) ? raw.campaigns : []
}

function selectCampaign(campaigns: Campaign[]) {
  const requested = String(process.env.LEADPILOT_CAMPAIGN_ID || '').trim()
  if (requested) {
    const found = campaigns.find((campaign) => campaign.id === requested)
    if (!found) throw new Error(`Unknown LEADPILOT_CAMPAIGN_ID: ${requested}`)
    return found
  }

  const state = readJson(STATE_PATH, { cursor: -1 })
  const cursor = (Number(state.cursor ?? -1) + 1) % campaigns.length
  const campaign = campaigns[cursor]
  state.cursor = cursor
  state.lastSelectedAt = new Date().toISOString()
  state.lastCampaignId = campaign.id
  writeJson(STATE_PATH, state)
  return campaign
}

function leadPilotUrl() {
  return pickEnv(['LEADPILOT_URL']) || DEFAULT_LEADPILOT_URL
}

function scenePlan(campaign: Campaign) {
  return {
    fullVoiceover: campaign.scenes.map((scene) => scene.voiceover).join(' '),
    scenes: campaign.scenes
  }
}

async function collectScenes(campaign: Campaign) {
  ensureDir(TEMP_DIR)
  const scenes: any[] = []
  for (const [index, scene] of campaign.scenes.slice(0, 5).entries()) {
    const fetched = await fetchBrollForScene(
      { ...scene, brollQueries: [scene.brollQuery, ...(campaign.brollQueries || [])] },
      { id: campaign.id, name: campaign.name, category: 'landscaping contractor business software', brollQueries: campaign.brollQueries },
      TEMP_DIR,
      index
    )
    if (!hasUsableFile(fetched?.file || '')) {
      throw new Error(`Could not find usable b-roll for scene ${index + 1}: ${scene.name}`)
    }
    scenes.push({
      file: fetched.file,
      seconds: scene.seconds,
      kind: fetched.kind,
      query: fetched.query,
      source: fetched.kind === 'photo' ? 'pexels_photo' : 'pexels_video'
    })
  }
  return scenes
}

function captions(campaign: Campaign) {
  const url = new URL(leadPilotUrl())
  const base = `${campaign.name}\n\n${campaign.description}\n\n${campaign.cta}`
  const tags = '#LeadPilot #LandscapingBusiness #Landscaping #LawnCareBusiness #ContractorMarketing #LeadManagement #SmallBusiness'

  const withTracking = (platform: string) => {
    const tracked = new URL(url.toString())
    tracked.searchParams.set('utm_source', platform)
    tracked.searchParams.set('utm_medium', 'organic_social')
    tracked.searchParams.set('utm_campaign', campaign.id.toLowerCase())
    tracked.searchParams.set('utm_content', 'short_video')
    return tracked.toString()
  }

  return {
    youtube: `${base}\n\nStart here: ${withTracking('youtube')}\n\n${tags}`,
    facebook: `${base}\n\nStart here: ${withTracking('facebook')}\n\n${tags}`
  }
}

async function renderCampaign(campaign: Campaign) {
  ensureDir(OUTPUT_DIR)
  const plan = scenePlan(campaign)
  const scenes = await collectScenes(campaign)
  const voiceoverFile = await createNarration(
    { id: campaign.id, name: campaign.name },
    plan,
    { audience: 'landscaping contractors', tone: 'plainspoken practical' },
    TEMP_DIR
  )
  const videoFile = await composeVerticalAd({
    outputName: `${safeFileName(campaign.id)}.mp4`,
    scenes,
    voiceoverFile,
    captionText: campaign.hook.toUpperCase(),
    overlayText: `${campaign.overlayText}\nLEADPILOT · 14-DAY FREE TRIAL`
  })

  validateMarketingVideo(videoFile)
  const finalPath = path.resolve(OUTPUT_DIR, `${safeFileName(campaign.id)}-${Date.now()}.mp4`)
  fs.copyFileSync(videoFile, finalPath)
  log('LeadPilot video ready', { campaign: campaign.id, videoFile: finalPath })
  return finalPath
}

function publicBucketName() {
  return pickEnv(['GCS_PUBLIC_BUCKET', 'VIDEO_PUBLIC_BUCKET']) || DEFAULT_PUBLIC_VIDEO_BUCKET
}

function publicBucketUrlBase(bucket: string) {
  return process.env.VIDEO_PUBLIC_URL_BASE?.replace(/\/$/, '') || `https://storage.googleapis.com/${bucket}`
}

async function uploadVideoForFacebook(videoFile: string) {
  const storage = new Storage()
  const bucketName = publicBucketName()
  const objectName = `leadpilot-social/${Date.now()}-${safeFileName(path.basename(videoFile), 'mp4')}`
  await storage.bucket(bucketName).upload(videoFile, {
    destination: objectName,
    resumable: false,
    metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=604800' }
  })
  if (String(process.env.GCS_MAKE_OBJECT_PUBLIC || '').toLowerCase() === 'true') {
    await storage.bucket(bucketName).file(objectName).makePublic()
  }
  return `${publicBucketUrlBase(bucketName)}/${objectName.split('/').map(encodeURIComponent).join('/')}`
}

async function postToYouTube(videoFile: string, campaign: Campaign, caption: string) {
  const clientId = pickEnv(['LEADPILOT_YT_CLIENT_ID', 'YT_CLIENT_ID', 'YOUTUBE_CLIENT_ID'])
  const clientSecret = pickEnv(['LEADPILOT_YT_CLIENT_SECRET', 'YT_CLIENT_SECRET', 'YOUTUBE_CLIENT_SECRET'])
  const refreshToken = pickEnv(['LEADPILOT_YT_REFRESH_TOKEN', 'YT_REFRESH_TOKEN', 'YOUTUBE_REFRESH_TOKEN'])
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Missing YouTube OAuth credentials')

  const oauth2 = new google.auth.OAuth2({ clientId, clientSecret })
  oauth2.setCredentials({ refresh_token: refreshToken })
  const youtube = google.youtube({ version: 'v3', auth: oauth2 })
  const result = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: campaign.name.slice(0, 95), description: caption, categoryId: '22' },
      status: { privacyStatus: (process.env.LEADPILOT_YT_PRIVACY_STATUS as any) || 'public' }
    },
    media: { body: fs.createReadStream(videoFile) }
  })
  if (!result.data.id) throw new Error('YouTube upload did not return a video ID')
  return result.data.id
}

async function postToFacebook(videoUrl: string, caption: string) {
  const accessToken = pickEnv(['LEADPILOT_FB_PAGE_ACCESS_TOKEN', 'FB_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN'])
  const pageId = pickEnv(['LEADPILOT_FB_PAGE_ID', 'FB_PAGE_ID', 'FACEBOOK_PAGE_ID'])
  if (!accessToken || !pageId) throw new Error('Missing Facebook page credentials')
  const apiVersion = process.env.FACEBOOK_API_VERSION || 'v20.0'
  const response = await axios.post(`https://graph.facebook.com/${apiVersion}/${pageId}/videos`, {
    file_url: videoUrl,
    description: caption,
    published: true
  }, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 120000
  })
  if (!response.data?.id) throw new Error(`Facebook did not return a video ID: ${JSON.stringify(response.data)}`)
  return String(response.data.id)
}

async function main() {
  await loadSecrets()
  const campaigns = loadCampaigns()
  if (!campaigns.length) throw new Error(`No LeadPilot campaigns found in ${CONFIG_PATH}`)
  if (!hasValue('PEXELS_API_KEY')) throw new Error('PEXELS_API_KEY is required for LeadPilot b-roll')

  const campaign = selectCampaign(campaigns)
  const plan = scenePlan(campaign)
  const copy = captions(campaign)
  const publish = String(process.env.LEADPILOT_PUBLISH || 'false').toLowerCase() === 'true'

  if (String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true') {
    log('LeadPilot dry run', { campaign: campaign.id, publish, url: leadPilotUrl(), captions: copy, voiceover: plan.fullVoiceover })
    return
  }

  const videoFile = await renderCampaign(campaign)
  if (!publish) {
    log('LeadPilot generation complete; publishing disabled', {
      videoFile,
      next: 'Run npm run leadpilot:post to publish to YouTube and Facebook.'
    })
    return
  }

  const platforms = Array.from(new Set(String(process.env.LEADPILOT_PLATFORMS || 'youtube,facebook').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean)))
  const results: Record<string, any> = {}

  if (platforms.includes('youtube')) {
    results.youtube = await postToYouTube(videoFile, campaign, copy.youtube)
    log('LeadPilot posted to YouTube', { id: results.youtube })
  }

  if (platforms.includes('facebook')) {
    const publicVideoUrl = await uploadVideoForFacebook(videoFile)
    results.facebook = await postToFacebook(publicVideoUrl, copy.facebook)
    log('LeadPilot posted to Facebook', { id: results.facebook, publicVideoUrl })
  }

  if (!Object.keys(results).length) throw new Error('No LeadPilot platforms were enabled')
  log('LeadPilot social post complete', { campaign: campaign.id, videoFile, results })
}

main().catch((error) => {
  console.error('LeadPilot video failed:', error?.message || error)
  process.exit(1)
})
