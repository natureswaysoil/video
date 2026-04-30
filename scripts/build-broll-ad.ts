import 'dotenv/config'
import fetch from 'node-fetch'
import fs from 'fs/promises'
import path from 'path'
import { getDailySeeds } from '../src/content-seed-bank'
import { loadSecretsToEnv } from '../src/secret-manager'

async function fetchPexelsVideos(query: string, apiKey: string) {
  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5`, {
    headers: {
      Authorization: apiKey
    }
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Pexels search failed ${res.status}: ${body}`)
  }

  const data = await res.json()
  return data.videos || []
}

async function downloadVideo(url: string, filePath: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download video ${res.status}: ${url}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(filePath, buffer)
}

async function main() {
  await loadSecretsToEnv(['PEXELS_API_KEY'])

  const pexelsApiKey = process.env.PEXELS_API_KEY
  if (!pexelsApiKey) {
    throw new Error('PEXELS_API_KEY not set in Google Secret Manager or local env')
  }

  const seed = getDailySeeds(1)[0]

  console.log('Building b-roll ad for:', seed.title)

  const queries = seed.visualPrompt
    .split(',')
    .map(q => q.trim())
    .filter(Boolean)
    .slice(0, 4)

  const outputDir = path.join(process.cwd(), 'output')
  await fs.mkdir(outputDir, { recursive: true })

  let index = 0
  for (const q of queries) {
    const videos = await fetchPexelsVideos(q, pexelsApiKey)
    if (videos.length > 0) {
      const videoFile = videos[0].video_files.find((v: any) => v.quality === 'sd') || videos[0].video_files[0]
      const filePath = path.join(outputDir, `clip_${index}.mp4`)
      console.log('Downloading clip:', q)
      await downloadVideo(videoFile.link, filePath)
      index++
    } else {
      console.log('No Pexels clips found for:', q)
    }
  }

  console.log(`Downloaded ${index} clips to ${outputDir}`)
  console.log('Next step: combine clips with ffmpeg.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
