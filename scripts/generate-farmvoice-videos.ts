// @ts-nocheck
/**
 * Generates FarmVoice Records campaign videos using the D-ID talking-head
 * pipeline with 4-scene Pexels b-roll composited behind the presenter.
 *
 * Usage:
 *   npm run generate:farmvoice-videos
 *   ONLY_ANGLE=farmvoice-sunday-catchup npm run generate:farmvoice-videos
 *   DRY_RUN=true npm run generate:farmvoice-videos
 */
import 'dotenv/config'
import path from 'path'
import fs from 'fs'
import fetch from 'node-fetch'
import { loadSecretsToEnv } from '../src/secret-manager'
import { createClientWithSecrets as createDIDClientWithSecrets } from '../src/did'
import { generateScript } from '../src/openai'

const SECRETS_TO_LOAD = ['DID_API_KEY', 'DiD', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'PEXELS_API_KEY']
const OUT_DIR = path.resolve(process.cwd(), 'farmvoice-campaign-videos')

// ── Campaign angles ───────────────────────────────────────────────────────────

type FarmVoiceAngle = {
  id: string
  title: string
  description: string
  fileName: string
}

const ANGLES: FarmVoiceAngle[] = [
  {
    id: 'farmvoice-sunday-catchup',
    title: 'FarmVoice Records — The Sunday Night Catch-Up',
    description: 'Farm record-keeping app: voice-first capture, pesticide records, crew time. $49/month per farm, 14-day free trial. Stop spending Sunday nights catching up on records you should have captured in the field.',
    fileName: 'farmvoice-sunday-catchup.mp4',
  },
  {
    id: 'farmvoice-speak-at-tank',
    title: 'FarmVoice Records — Speak It at the Tank',
    description: 'FarmVoice Records converts spoken pesticide applications into complete RUP records with GPS, application rates, crop, and applicator. English and Spanish voice capture. Inspection packages ready in seconds.',
    fileName: 'farmvoice-speak-at-tank.mp4',
  },
  {
    id: 'farmvoice-auditor-arrived',
    title: 'FarmVoice Records — The Auditor Showed Up',
    description: 'Export a court-ready farm inspection package — pesticide records, GPS evidence, applicator info — in under a minute from your phone. Be ready before the inspector arrives.',
    fileName: 'farmvoice-auditor-arrived.mp4',
  },
  {
    id: 'farmvoice-h2a-binders',
    title: 'FarmVoice Records — H-2A Without the Binders',
    description: 'H-2A contracts, worker records, housing inspections, arrival checklists, payroll worksheets and DOL audit exports — all in one app. $149/month add-on. Included free in your 14-day trial.',
    fileName: 'farmvoice-h2a-binders.mp4',
  },
  {
    id: 'farmvoice-one-phone-crew',
    title: 'FarmVoice Records — One Phone for the Whole Crew',
    description: 'Schedule work, GPS clock-in a crew of 6 with one phone, capture crew records, review and approve time, export payroll-ready data. No one-phone-per-worker requirement.',
    fileName: 'farmvoice-one-phone-crew.mp4',
  },
  {
    id: 'farmvoice-quickbooks-handoff',
    title: 'FarmVoice Records — QuickBooks Handoff',
    description: 'FarmVoice Reviews approved crew time and sends individual worker TimeActivity records directly to QuickBooks Online. Farm accountants stop re-keying spreadsheets.',
    fileName: 'farmvoice-quickbooks-handoff.mp4',
  },
]

// ── OpenAI voiceover templates (per angle) ────────────────────────────────────

const VOICEOVER_TEMPLATES: Record<string, string> = {
  'farmvoice-sunday-catchup': `Write a 60-second spoken voiceover for a direct-response ad for {title}.

Product: {details}

Lead with: "Every week I spend Sunday night catching up on records I should've captured in the field."
Paint the problem of manual farm recordkeeping — the binders, the guessing, the lost time.
Introduce FarmVoice Records as the fix: speak the record while you're still at the tank or in the field.
Mention: voice capture in English or Spanish, pesticide records, crew time.
End with exactly: "Start your free 14-day trial at farmvoicerecords.com"`,

  'farmvoice-speak-at-tank': `Write a 60-second spoken voiceover for a demo-style ad for {title}.

Product: {details}

Open with the moment: farmer standing at a spray rig, pesticide application just finished.
Show the voice-to-record flow: "I said it once. FarmVoice turned it into a legal record."
Mention: GPS coordinates captured, application rates, crop, applicator — all filled in.
Emphasize: inspection packages ready in seconds, English and Spanish.
End with exactly: "Try FarmVoice Records free for 14 days at farmvoicerecords.com"`,

  'farmvoice-auditor-arrived': `Write a 60-second spoken voiceover for a fear-to-confidence ad for {title}.

Product: {details}

Open with tension: "An inspector showed up at 7 AM. I had 45 seconds to produce my pesticide records."
Turn the fear into confidence with FarmVoice: export a complete inspection package from your phone, instantly.
Mention GPS evidence, complete RUP records, H-2A audit exports.
End with exactly: "Be ready before they arrive. Try FarmVoice Records free at farmvoicerecords.com"`,

  'farmvoice-h2a-binders': `Write a 60-second spoken voiceover for an H-2A compliance ad for {title}.

Product: {details}

Open with the compliance burden: binders, DOL audits, housing inspections, payroll worksheets.
Paint the picture of H-2A paperwork chaos.
Introduce FarmVoice H-2A module: contracts, housing, arrival checklists, crew records, audit exports — one app.
Mention the price: $149/month add-on, included free in the 14-day trial.
End with exactly: "Start your free trial at farmvoicerecords.com"`,

  'farmvoice-one-phone-crew': `Write a 60-second spoken voiceover for an objection-busting ad for {title}.

Product: {details}

Open with the objection: "You probably think you need a smartphone for every worker."
Bust it immediately: one phone, GPS clock-in for the whole crew, one entry captures everyone.
Walk through: schedule the work, clock in the crew at the GPS location, end-of-day crew record.
Mention QuickBooks payroll export at the end.
End with exactly: "Try FarmVoice Records free for 14 days at farmvoicerecords.com"`,

  'farmvoice-quickbooks-handoff': `Write a 60-second spoken voiceover for an integration-focused ad for {title}.

Product: {details}

Open from the accountant's perspective: "My farm clients used to send me spreadsheets I had to rekey into QuickBooks every week."
Introduce FarmVoice: manager reviews and approves crew time, taps once, individual TimeActivity records appear in QuickBooks Online.
Mention: worker mapping, GPS-supported time, approved records only — no manual entry.
End with exactly: "Connect QuickBooks. Try FarmVoice Records free at farmvoicerecords.com"`,
}

// ── Pexels b-roll scene queries (4 scenes per angle) ─────────────────────────

const SCENE_QUERIES: Record<string, string[][]> = {
  'farmvoice-sunday-catchup': [
    ['farmer paperwork kitchen table', 'farm records binder paper', 'paperwork desk night', 'farmer writing notes'],
    ['farm field spray application', 'tractor spraying field', 'pesticide application farm', 'farmer spraying crops'],
    ['smartphone farm outdoor', 'farmer using phone field', 'mobile app farm use', 'phone outdoors agriculture'],
    ['green farm field morning', 'beautiful farm sunrise', 'farm landscape peaceful', 'agriculture field outdoor'],
  ],
  'farmvoice-speak-at-tank': [
    ['spray tank farm equipment', 'agricultural sprayer field', 'farm spray rig tank', 'farmer pesticide equipment'],
    ['farmer talking smartphone', 'voice recording outdoor', 'person speaking phone field', 'outdoor voice capture'],
    ['farm record inspection', 'clipboard farm checklist', 'farm documentation records', 'agricultural compliance'],
    ['inspection package documents', 'organized farm records', 'farmer paperwork complete', 'successful farm audit'],
  ],
  'farmvoice-auditor-arrived': [
    ['inspector arriving farm', 'official visit farm', 'compliance inspection outdoor', 'farm inspection visit'],
    ['farmer smartphone quick', 'mobile phone farm urgent', 'farm worker phone outdoor', 'farmer checking phone'],
    ['documents organized quickly', 'paperwork export digital', 'records ready instantly', 'farm compliance ready'],
    ['confident farmer field', 'farmer success outdoor', 'farm relief success', 'agriculture compliance success'],
  ],
  'farmvoice-h2a-binders': [
    ['migrant farm workers field', 'seasonal farm workers outdoor', 'h2a farm labor agricultural', 'farm crew workers field'],
    ['farm worker housing', 'farm labor housing outdoor', 'rural worker accommodation', 'farm bunkhouse exterior'],
    ['farm payroll paperwork', 'agricultural labor records', 'farm worker documents', 'payroll farm binders'],
    ['organized farm compliance', 'digital farm records app', 'farm documentation complete', 'farm audit success'],
  ],
  'farmvoice-one-phone-crew': [
    ['farm crew group outdoor', 'agricultural workers team', 'farm workers group field', 'crew farming outdoors'],
    ['one phone group workers', 'smartphone crew check-in', 'phone farm workers outdoor', 'mobile time tracking'],
    ['gps location farm outdoor', 'location tracking agriculture', 'farm gps field work', 'outdoor location farm'],
    ['farm payroll export', 'quickbooks farm accounting', 'farm worker payment', 'agriculture payroll data'],
  ],
  'farmvoice-quickbooks-handoff': [
    ['accountant laptop computer', 'farm accountant desk work', 'bookkeeper computer records', 'accounting software screen'],
    ['farm worker time records', 'crew hours agriculture', 'farm time tracking field', 'worker timesheet farm'],
    ['quickbooks accounting sync', 'financial software integration', 'accounting data transfer', 'payroll software farm'],
    ['farm finances organized', 'successful farm accounting', 'agriculture financial records', 'farm business organized'],
  ],
}

// ── Helpers (same as generate-test-campaign-videos.ts) ───────────────────────

async function findPortraitBroll(queries: string[], apiKey: string, label: string): Promise<string> {
  for (const query of queries) {
    try {
      const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=10&min_duration=5`
      const res = await fetch(url, { headers: { Authorization: apiKey } })
      if (!res.ok) { console.warn(`  Pexels ${res.status} for "${query}"`); continue }
      const data: any = await res.json()
      for (const video of (data.videos || [])) {
        const files: any[] = video.video_files || []
        const portrait = files.find((f: any) => Number(f.height) > Number(f.width) && f.link)
        const sd = files.find((f: any) => f.quality === 'sd' && f.link)
        const link = portrait?.link || sd?.link || files.find((f: any) => f.link)?.link
        if (link) { console.log(`  ${label}: "${query}" → found`); return link }
      }
    } catch (e: any) { console.warn(`  Pexels "${query}": ${e.message}`) }
  }
  console.log(`  ${label}: no clip found, using plain background`)
  return ''
}

async function downloadVideo(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { timeout: 120_000 } as any)
  if (!res.ok) throw new Error(`Download ${res.status}: ${url}`)
  const buf = await res.arrayBuffer()
  fs.writeFileSync(dest, Buffer.from(buf))
  console.log(`  Saved ${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB → ${path.basename(dest)}`)
}

function getVideoDuration(p: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const proc = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', p])
    let out = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('close', (code: number) => {
      const dur = parseFloat(out.trim())
      if (code === 0 && !isNaN(dur)) resolve(dur)
      else reject(new Error(`ffprobe failed (code ${code})`))
    })
  })
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', (d: Buffer) => { err += d.toString() })
    proc.on('close', (code: number) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg failed (${code}): ${err.slice(-400)}`))
    })
  })
}

async function compositeScenes(didPath: string, brollPaths: string[], outPath: string): Promise<void> {
  if (brollPaths.length === 0) { fs.copyFileSync(didPath, outPath); return }
  const dur = await getVideoDuration(didPath)
  const segDur = dur / brollPaths.length
  const W = 720, H = 1280, presW = 360
  const args: string[] = ['-y', '-i', didPath]
  for (const p of brollPaths) args.push('-stream_loop', '-1', '-i', p)
  const filters: string[] = []
  for (let i = 0; i < brollPaths.length; i++) {
    filters.push(`[${i+1}:v]trim=duration=${segDur.toFixed(3)},setpts=PTS-STARTPTS,scale=${W}:${H}:flags=lanczos:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[b${i}]`)
  }
  filters.push(`${brollPaths.map((_, i) => `[b${i}]`).join('')}concat=n=${brollPaths.length}:v=1:a=0[bg]`)
  filters.push(`[0:v]scale=${presW}:-2:flags=lanczos[pres]`)
  filters.push(`[bg][pres]overlay=(W-w)/2:H-h-20,format=yuv420p[v]`)
  args.push('-filter_complex', filters.join(';'), '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-shortest', outPath)
  console.log(`  Compositing ${brollPaths.length} scenes...`)
  await runFfmpeg(args)
  console.log(`  Output: ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Loading secrets...')
  await loadSecretsToEnv(SECRETS_TO_LOAD)

  const pexelsKey = process.env.PEXELS_API_KEY?.trim() || ''
  const dryRun = process.env.DRY_RUN?.toLowerCase() === 'true'
  const onlyAngle = process.env.ONLY_ANGLE?.trim()

  const did = dryRun ? null : await createDIDClientWithSecrets()
  if (!dryRun) console.log('Provider: D-ID')

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const angles = ANGLES.filter((a) => !onlyAngle || a.id === onlyAngle)
  if (angles.length === 0) throw new Error(`No angle matched ONLY_ANGLE=${onlyAngle}`)

  const results: { id: string; status: string; file?: string }[] = []

  for (const angle of angles) {
    console.log(`\n=== ${angle.id} ===`)
    console.log(`    ${angle.title}`)

    try {
      const template = VOICEOVER_TEMPLATES[angle.id] || VOICEOVER_TEMPLATES['farmvoice-sunday-catchup']
      const userTemplate = template
        .replace('{title}', angle.title)
        .replace('{details}', angle.description)

      console.log('  Generating voiceover...')
      const script = await generateScript(
        { title: angle.title, details: angle.description } as any,
        { userTemplate }
      )
      console.log(`  Script (${script.split(' ').length} words): ${script.slice(0, 80)}...`)

      if (dryRun) {
        console.log('  DRY_RUN — skipping D-ID and Pexels')
        results.push({ id: angle.id, status: 'dry-run' })
        continue
      }

      // Fetch 4 Pexels b-roll clips
      console.log('  Fetching b-roll clips from Pexels...')
      const sceneSets = SCENE_QUERIES[angle.id] || [['farm outdoor'], ['agriculture field'], ['crop farming'], ['farm success']]
      const brollUrls = await Promise.all(
        sceneSets.map((queries, i) => findPortraitBroll(queries, pexelsKey, `Scene ${i + 1}`))
      )

      // Submit D-ID job
      console.log('  Submitting D-ID job...')
      const jobId = await did!.createVideoJob({
        script,
        voiceId: process.env.DID_VOICE_ID || 'en-US-JennyNeural',
        sourceUrl: process.env.DID_SOURCE_URL || undefined,
        title: angle.title,
      })
      console.log(`  Job ID: ${jobId}`)

      console.log('  Polling (up to 15 min)...')
      const videoUrl = await did!.pollJobForVideoUrl(jobId, { timeoutMs: 15 * 60_000, intervalMs: 10_000 })

      // Download and composite
      const tmpDir = path.join(OUT_DIR, '.tmp')
      fs.mkdirSync(tmpDir, { recursive: true })
      const didTmp = path.join(tmpDir, `${angle.id}-did.mp4`)

      console.log('  Downloading D-ID presenter...')
      await downloadVideo(videoUrl, didTmp)

      const brollPaths: string[] = []
      for (let i = 0; i < brollUrls.length; i++) {
        if (!brollUrls[i]) continue
        const bp = path.join(tmpDir, `${angle.id}-broll${i}.mp4`)
        console.log(`  Downloading b-roll ${i + 1}...`)
        await downloadVideo(brollUrls[i], bp)
        brollPaths.push(bp)
      }

      const finalPath = path.join(OUT_DIR, angle.fileName)
      await compositeScenes(didTmp, brollPaths, finalPath)

      try { fs.unlinkSync(didTmp) } catch {}
      for (const bp of brollPaths) { try { fs.unlinkSync(bp) } catch {} }

      console.log(`  ✅ ${angle.fileName}`)
      results.push({ id: angle.id, status: 'success', file: angle.fileName })
    } catch (err: any) {
      console.error(`  ❌ ${angle.id}: ${err.message}`)
      results.push({ id: angle.id, status: 'error' })
    }
  }

  console.log('\n── Results ──')
  for (const r of results) {
    const icon = r.status === 'success' ? '✅' : r.status === 'dry-run' ? '🔁' : '❌'
    console.log(`${icon} ${r.id}${r.file ? ` → ${r.file}` : ''}`)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
