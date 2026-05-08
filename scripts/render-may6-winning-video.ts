// @ts-nocheck
import 'dotenv/config'
import path from 'path'
import fs from 'fs'
import fetch from 'node-fetch'
import { spawnSync } from 'child_process'
import OpenAI from 'openai'
import { loadSecretsToEnv } from '../src/secret-manager'

const SECRET_NAMES = ['OPENAI_API_KEY', 'PEXELS_API_KEY']

const PRODUCT = {
  slug: 'enhanced-living-compost-may6-test',
  title: 'Build Better Garden Soil - Enhanced Living Compost',
}

const SCENES = [
  {
    seconds: 4,
    query: 'raised bed garden soil close up dry potting mix',
    overlay: 'Tired garden soil?',
    narration: 'If your garden soil looks tired, start by rebuilding the soil itself.',
  },
  {
    seconds: 5,
    query: 'hands holding rich compost soil close up',
    overlay: 'Living compost blend',
    narration: 'Enhanced Living Compost is made to support raised beds, containers, and planting mixes.',
  },
  {
    seconds: 6,
    query: 'mixing compost into raised bed garden soil',
    overlay: 'Mix into beds or pots',
    narration: 'Blend it into garden beds, containers, or planting holes before watering in.',
  },
  {
    seconds: 6,
    query: 'worm castings biochar compost close up soil',
    overlay: 'Castings + biochar',
    narration: 'Worm castings, biochar, compost, and fermented duckweed help support living soil.',
  },
  {
    seconds: 7,
    query: 'healthy raised bed vegetable garden sunlight',
    overlay: 'Natures Way Soil',
    narration: 'For full garden use directions, visit Nature’s Way Soil and look for Enhanced Living Compost.',
  },
]

function run(cmd: string, args: string[], cwd = process.cwd()) {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${cmd} failed with exit code ${result.status}`)
}

function ensureFfmpeg() {
  const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  if (result.status !== 0) {
    throw new Error('ffmpeg is not installed. Run: sudo apt-get update && sudo apt-get install -y ffmpeg')
  }
}

async function download(url: string, outPath: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  const arrayBuffer = await res.arrayBuffer()
  fs.writeFileSync(outPath, Buffer.from(arrayBuffer))
}

async function pexels(query: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) throw new Error('Missing PEXELS_API_KEY')
  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=8`, {
    headers: { Authorization: apiKey },
  })
  if (!res.ok) throw new Error(`Pexels failed ${res.status}: ${await res.text()}`)
  const data: any = await res.json()
  const video = (data.videos || [])[0]
  if (!video) throw new Error(`No Pexels video for: ${query}`)
  const files = video.video_files || []
  const portrait = files.find((f: any) => Number(f.height || 0) > Number(f.width || 0) && Number(f.height || 0) >= 720)
  const picked = portrait || files.find((f: any) => f.quality === 'sd') || files[0]
  if (!picked?.link) throw new Error(`No video file for: ${query}`)
  console.log('Selected Pexels clip:', { query, pexelsVideoId: video.id })
  return picked.link
}

function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '')
}

function renderScene(inputPath: string, outputPath: string, scene: any) {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
  const overlay = escapeText(scene.overlay)
  const vf = [
    'scale=720:1280:force_original_aspect_ratio=increase',
    'crop=720:1280',
    'setsar=1',
    'drawbox=x=0:y=1040:w=720:h=190:color=black@0.45:t=fill',
    `drawtext=fontfile=${font}:text='${overlay}':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=1095`,
    'fade=t=in:st=0:d=0.25',
    `fade=t=out:st=${Math.max(0, scene.seconds - 0.35)}:d=0.35`,
  ].join(',')
  run('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-t', String(scene.seconds),
    '-vf', vf,
    '-an',
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ])
}

async function voiceover(outPath: string) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const script = SCENES.map((s) => s.narration).join(' ')
  console.log('Voiceover:', script)
  const audio = await openai.audio.speech.create({
    model: process.env.OPENAI_TTS_MODEL || 'tts-1',
    voice: process.env.OPENAI_TTS_VOICE || 'alloy',
    input: script,
  })
  fs.writeFileSync(outPath, Buffer.from(await audio.arrayBuffer()))
}

function concat(scenePaths: string[], audioPath: string, finalPath: string, workDir: string) {
  const listPath = path.join(workDir, 'concat-list.txt')
  fs.writeFileSync(listPath, scenePaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'))

  run('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-i', audioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-vf', 'scale=720:1280,setsar=1,fps=30,format=yuv420p',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    finalPath,
  ])
}

async function main() {
  await loadSecretsToEnv(SECRET_NAMES)
  ensureFfmpeg()
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY')
  if (!process.env.PEXELS_API_KEY) throw new Error('Missing PEXELS_API_KEY')

  const workDir = path.join(process.cwd(), 'output', 'may6-winning-render')
  const outDir = path.join(process.cwd(), 'test-campaign-videos')
  fs.mkdirSync(workDir, { recursive: true })
  fs.mkdirSync(outDir, { recursive: true })

  const renderedScenes: string[] = []
  for (let i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i]
    const rawPath = path.join(workDir, `raw-${i + 1}.mp4`)
    const scenePath = path.join(workDir, `scene-${i + 1}.mp4`)
    const url = await pexels(scene.query)
    await download(url, rawPath)
    renderScene(rawPath, scenePath, scene)
    renderedScenes.push(scenePath)
  }

  const audioPath = path.join(workDir, 'voiceover.mp3')
  await voiceover(audioPath)

  const finalPath = path.join(outDir, `${PRODUCT.slug}.mp4`)
  concat(renderedScenes, audioPath, finalPath, workDir)
  console.log('✅ Rendered May 6 style video:', finalPath)
  console.log('Next: run npm run run:test-campaign with the may6 seed selected.')
}

main().catch((error) => {
  console.error('❌ May 6 render failed:', error?.message || error)
  process.exit(1)
})
