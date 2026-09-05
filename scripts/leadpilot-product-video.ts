// @ts-nocheck
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { Storage } from '@google-cloud/storage'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { composeVerticalAd } from './lib/ffmpeg-compositor'
import { validateMarketingVideo } from './lib/video-quality-gate'
import { fetchBrollForScene } from './lib/pexels-media'
import { createNarration } from './lib/video-provider'
import { createLeadPilotProductVisual, inferLeadPilotVisual } from './lib/leadpilot-product-visuals'
import { ensureDir, hasUsableFile, safeFileName } from './lib/video-utils'
import { postToYouTube } from '../src/youtube'
import { postToFacebook } from '../src/facebook'

type Campaign = {
  id: string
  name: string
  description: string
  hook: string
  overlayText: string
  cta: string
  brollQueries: string[]
  scenes: Array<{ name: string; seconds: number; voiceover: string; caption: string; brollQuery: string }>
}

const ROOT = process.cwd()
const CONFIG_PATH = path.resolve(ROOT, process.env.LEADPILOT_CAMPAIGNS_FILE || 'config/leadpilot-campaigns.json')
const OUTPUT_DIR = path.resolve(ROOT, 'output/leadpilot')
const TEMP_DIR = path.resolve(ROOT, 'temp-leadpilot')
const STATE_PATH = path.resolve(ROOT, process.env.LEADPILOT_STATE_FILE || 'data/leadpilot-video-state.json')
const DEFAULT_PUBLIC_VIDEO_BUCKET = 'natureswaysoil-social-videos'
const DEFAULT_LEADPILOT_URL = 'https://followupnest-git-feature-onboard-fc8b14-james-projects-5e9a58a0.vercel.app/'

const SECRET_NAMES = [
  'OPENAI_API_KEY', 'PEXELS_API_KEY',
  'YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN',
  'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN',
  'FB_PAGE_ACCESS_TOKEN', 'FB_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID',
  'LEADPILOT_YT_CLIENT_ID', 'LEADPILOT_YT_CLIENT_SECRET', 'LEADPILOT_YT_REFRESH_TOKEN',
  'LEADPILOT_FB_PAGE_ACCESS_TOKEN', 'LEADPILOT_FB_PAGE_ID',
  'GCS_PUBLIC_BUCKET', 'VIDEO_PUBLIC_BUCKET', 'VIDEO_PUBLIC_URL_BASE', 'LEADPILOT_URL'
]

function log(message: string, data?: any) { data === undefined ? console.log(message) : console.log(message, data) }
function hasValue(name: string) { const value = process.env[name]?.trim(); return Boolean(value && !/your-|your_|changeme|placeholder|paste_|replace_|dummy_|example_/i.test(value)) }
function pickEnv(keys: string[]) { for (const key of keys) { const value = process.env[key]?.trim(); if (value) return value } return '' }
function readJson(file: string, fallback: any) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback } catch { return fallback } }
function writeJson(file: string, data: any) { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8') }

async function loadSecrets() {
  if (String(process.env.USE_SECRET_MANAGER || 'true').toLowerCase() === 'false') return
  const dryRun = String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true'
  const hasAdc = !!process.env.GOOGLE_APPLICATION_CREDENTIALS || !!process.env.GOOGLE_GHA_CREDS_PATH
  if (dryRun && !hasAdc) return
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'natureswaysoil-video'
  const client = new SecretManagerServiceClient()
  for (const secretName of SECRET_NAMES) {
    if (hasValue(secretName)) continue
    const candidates = [...new Set([secretName, secretName.toLowerCase().replace(/_/g, '-'), secretName.replace(/_/g, '-')])]
    for (const candidate of candidates) {
      try {
        const [version] = await client.accessSecretVersion({ name: `projects/${projectId}/secrets/${candidate}/versions/latest` })
        const value = version.payload?.data?.toString().trim()
        if (value) { process.env[secretName] = value; break }
      } catch (error: any) {
        if (Number(error?.code) === 5 || String(error?.message || '').toUpperCase().includes('NOT_FOUND')) continue
        if (Number(error?.code) === 7 || String(error?.message || '').toUpperCase().includes('PERMISSION_DENIED')) throw error
        break
      }
    }
  }
}

function selectCampaign(campaigns: Campaign[]) {
  const requested = String(process.env.LEADPILOT_CAMPAIGN_ID || '').trim()
  if (requested) {
    const match = campaigns.find((campaign) => campaign.id === requested)
    if (!match) throw new Error(`Unknown LEADPILOT_CAMPAIGN_ID: ${requested}`)
    return match
  }
  const state = readJson(STATE_PATH, { cursor: -1 })
  const cursor = (Number(state.cursor ?? -1) + 1) % campaigns.length
  state.cursor = cursor
  state.lastCampaignId = campaigns[cursor].id
  state.lastSelectedAt = new Date().toISOString()
  writeJson(STATE_PATH, state)
  return campaigns[cursor]
}

function leadPilotUrl() { return pickEnv(['LEADPILOT_URL']) || DEFAULT_LEADPILOT_URL }
function scenePlan(campaign: Campaign) { return { fullVoiceover: campaign.scenes.map((scene) => scene.voiceover).join(' '), scenes: campaign.scenes } }

async function collectScenes(campaign: Campaign) {
  ensureDir(TEMP_DIR)
  const scenes: any[] = []
  let productScreens = 0

  for (const [index, scene] of campaign.scenes.slice(0, 5).entries()) {
    const visual = inferLeadPilotVisual(scene)
    // Keep the first problem scene as real-world landscaping footage. Use product
    // screens for the software explanation, database, Gmail, and trial scenes.
    if (index > 0 && visual) {
      const file = createLeadPilotProductVisual(visual, TEMP_DIR)
      scenes.push({ file, seconds: scene.seconds, kind: 'photo', source: `leadpilot_${visual}` })
      productScreens++
      continue
    }

    const fetched = await fetchBrollForScene(
      { ...scene, brollQueries: [scene.brollQuery, ...(campaign.brollQueries || [])] },
      { id: campaign.id, name: campaign.name, category: 'landscaping contractor business', brollQueries: campaign.brollQueries },
      TEMP_DIR,
      index
    )
    if (!hasUsableFile(fetched?.file || '')) throw new Error(`Could not find usable b-roll for scene ${index + 1}: ${scene.name}`)
    scenes.push({ file: fetched.file, seconds: scene.seconds, kind: fetched.kind, source: fetched.kind === 'photo' ? 'pexels_photo' : 'pexels_video', query: fetched.query })
  }

  log('LeadPilot scene mix', { productScreens, brollScenes: scenes.length - productScreens, scenes: scenes.map((scene) => scene.source) })
  return scenes
}

function captions(campaign: Campaign) {
  const withTracking = (platform: string) => {
    const url = new URL(leadPilotUrl())
    url.searchParams.set('utm_source', platform)
    url.searchParams.set('utm_medium', 'organic_social')
    url.searchParams.set('utm_campaign', campaign.id.toLowerCase())
    url.searchParams.set('utm_content', 'product_demo_video')
    return url.toString()
  }
  const tags = '#LeadPilot #LandscapingBusiness #Landscaping #LawnCareBusiness #LeadManagement #SmallBusiness'
  return {
    youtube: `${campaign.name}\n\n${campaign.description}\n\n${campaign.cta}\n\nStart here: ${withTracking('youtube')}\n\n${tags}`,
    facebook: `${campaign.hook}\n\n${campaign.description}\n\n${campaign.cta}\n\nStart here: ${withTracking('facebook')}\n\n${tags}`
  }
}

async function render(campaign: Campaign) {
  ensureDir(OUTPUT_DIR)
  const plan = scenePlan(campaign)
  const scenes = await collectScenes(campaign)
  const voiceoverFile = await createNarration({ id: campaign.id, name: campaign.name }, plan, { audience: 'landscaping contractors', tone: 'plainspoken practical' }, TEMP_DIR)
  const built = await composeVerticalAd({
    outputName: `${safeFileName(campaign.id)}.mp4`,
    scenes,
    voiceoverFile,
    captionText: campaign.hook.toUpperCase(),
    overlayText: `${campaign.overlayText}\nLEADPILOT · 14-DAY FREE TRIAL`
  })
  validateMarketingVideo(built)
  const finalPath = path.resolve(OUTPUT_DIR, `${safeFileName(campaign.id)}-${Date.now()}.mp4`)
  fs.copyFileSync(built, finalPath)
  return finalPath
}

function publicBucketName() { return pickEnv(['GCS_PUBLIC_BUCKET', 'VIDEO_PUBLIC_BUCKET']) || DEFAULT_PUBLIC_VIDEO_BUCKET }
async function uploadForFacebook(videoFile: string) {
  const storage = new Storage()
  const bucketName = publicBucketName()
  const objectName = `leadpilot-social/${Date.now()}-${safeFileName(path.basename(videoFile), 'mp4')}`
  await storage.bucket(bucketName).upload(videoFile, { destination: objectName, resumable: false, metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=604800' } })
  if (String(process.env.GCS_MAKE_OBJECT_PUBLIC || '').toLowerCase() === 'true') await storage.bucket(bucketName).file(objectName).makePublic()
  const base = process.env.VIDEO_PUBLIC_URL_BASE?.replace(/\/$/, '') || `https://storage.googleapis.com/${bucketName}`
  return `${base}/${objectName.split('/').map(encodeURIComponent).join('/')}`
}

async function main() {
  await loadSecrets()
  const campaigns = readJson(CONFIG_PATH, { campaigns: [] }).campaigns as Campaign[]
  if (!campaigns?.length) throw new Error(`No LeadPilot campaigns found in ${CONFIG_PATH}`)
  const campaign = selectCampaign(campaigns)
  const publish = String(process.env.LEADPILOT_PUBLISH || 'false').toLowerCase() === 'true'
  const copy = captions(campaign)

  if (String(process.env.DRY_RUN_LOG_ONLY || '').toLowerCase() === 'true') {
    log('LeadPilot dry run', { campaign: campaign.id, publish, productVisuals: campaign.scenes.map((scene, i) => i > 0 ? inferLeadPilotVisual(scene) || 'broll' : 'broll'), captions: copy })
    return
  }

  if (!hasValue('PEXELS_API_KEY')) throw new Error('PEXELS_API_KEY is required for the landscaping b-roll scenes')
  const videoFile = await render(campaign)
  log('LeadPilot product-demo video ready', { campaign: campaign.id, videoFile })

  if (!publish) {
    log('Publishing disabled. Review the generated video first.', { videoFile })
    return
  }

  const platforms = Array.from(new Set(String(process.env.LEADPILOT_PLATFORMS || 'youtube,facebook').toLowerCase().split(',').map((item) => item.trim()).filter(Boolean)))
  const results: Record<string, string> = {}

  if (platforms.includes('youtube')) {
    const clientId = pickEnv(['LEADPILOT_YT_CLIENT_ID', 'YT_CLIENT_ID', 'YOUTUBE_CLIENT_ID'])
    const clientSecret = pickEnv(['LEADPILOT_YT_CLIENT_SECRET', 'YT_CLIENT_SECRET', 'YOUTUBE_CLIENT_SECRET'])
    const refreshToken = pickEnv(['LEADPILOT_YT_REFRESH_TOKEN', 'YT_REFRESH_TOKEN', 'YOUTUBE_REFRESH_TOKEN'])
    results.youtube = await postToYouTube(videoFile, copy.youtube, clientId, clientSecret, refreshToken, (process.env.LEADPILOT_YT_PRIVACY_STATUS as any) || 'public')
  }

  if (platforms.includes('facebook')) {
    const pageToken = pickEnv(['LEADPILOT_FB_PAGE_ACCESS_TOKEN', 'FB_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN'])
    const pageId = pickEnv(['LEADPILOT_FB_PAGE_ID', 'FB_PAGE_ID', 'FACEBOOK_PAGE_ID'])
    const videoUrl = await uploadForFacebook(videoFile)
    results.facebook = await postToFacebook(videoUrl, copy.facebook, pageToken, pageId)
  }

  if (!Object.keys(results).length) throw new Error('No LeadPilot platforms were enabled')
  log('LeadPilot product-demo social post complete', { campaign: campaign.id, results })
}

main().catch((error) => { console.error('LeadPilot product video failed:', error?.message || error); process.exit(1) })
