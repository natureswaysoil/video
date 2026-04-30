import 'dotenv/config'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { getDailySeeds } from '../src/content-seed-bank'

const PEXELS_API_KEY = process.env.PEXELS_API_KEY

async function fetchPexelsVideos(query: string) {
  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5`, {
    headers: {
      Authorization: PEXELS_API_KEY || ''
    }
  })
  const data = await res.json()
  return data.videos || []
}

async function downloadVideo(url: string, filePath: string) {
  const res = await fetch(url)
  const fileStream = fs.createWriteStream(filePath)
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream)
    res.body.on('error', reject)
    fileStream.on('finish', resolve)
  })
}

async function main() {
  if (!PEXELS_API_KEY) {
    throw new Error('PEXELS_API_KEY not set')
  }

  const seed = getDailySeeds(1)[0]

  console.log('Building b-roll ad for:', seed.title)

  const queries = seed.visualPrompt.split(',').slice(0, 4)

  const outputDir = path.join(process.cwd(), 'output')
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir)

  let index = 0
  for (const q of queries) {
    const videos = await fetchPexelsVideos(q)
    if (videos.length > 0) {
      const videoFile = videos[0].video_files.find((v: any) => v.quality === 'sd') || videos[0].video_files[0]
      const filePath = path.join(outputDir, `clip_${index}.mp4`)
      console.log('Downloading clip:', q)
      await downloadVideo(videoFile.link, filePath)
      index++
    }
  }

  console.log('Downloaded clips. Next step: combine clips with ffmpeg.')
}

main().catch(console.error)
