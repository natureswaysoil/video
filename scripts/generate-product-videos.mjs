#!/usr/bin/env node

/**
 * Generate product videos using HeyGen AI
 * 
 * This script:
 * - Processes exactly ONE product per run (not all products)
 * - Loads HeyGen API key from Google Secret Manager
 * - Uses HeyGen for video generation only (no FFmpeg fallback)
 * - Writes video URL back to Google Sheet
 */

import 'dotenv/config'
import axios from 'axios'

console.log('🎬 Starting HeyGen AI Video Generation for Products')
console.log('━'.repeat(70))

// ===== Step 1: Load HeyGen API Key from Google Secret Manager =====
async function getHeyGenApiKey() {
  const directKey = process.env.HEYGEN_API_KEY
  if (directKey) {
    console.log('✓ Using HEYGEN_API_KEY from environment')
    return directKey
  }

  const secretName = process.env.GCP_SECRET_HEYGEN_API_KEY
  if (!secretName) {
    throw new Error('HeyGen API key not found. Set HEYGEN_API_KEY or GCP_SECRET_HEYGEN_API_KEY')
  }

  try {
    console.log('🔐 Loading HeyGen API key from Google Secret Manager...')
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager')
    const client = new SecretManagerServiceClient()
    const [accessResponse] = await client.accessSecretVersion({ name: secretName })
    const payload = accessResponse.payload?.data?.toString('utf8')
    
    if (!payload) {
      throw new Error('Failed to load HeyGen API key from Secret Manager')
    }
    
    console.log('✓ Loaded HeyGen API key from Secret Manager')
    return payload
  } catch (error) {
    throw new Error(`Failed to access Google Secret Manager: ${error.message}`)
  }
}

// ===== Step 2: Parse CSV and get FIRST eligible product =====
function splitCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function pickFirst(rec, keys) {
  for (const k of keys) {
    const v = rec[k]
    if (v && v.length > 0) return v
  }
  return undefined
}

function isTruthy(val, customValues) {
  const v = val.trim().toLowerCase()
  const defaults = ['1', 'true', 'yes', 'y', 'on', 'post', 'enabled']
  const list = customValues 
    ? customValues.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : defaults
  return list.includes(v)
}

async function getFirstEligibleProduct(csvUrl) {
  const { data } = await axios.get(csvUrl, { responseType: 'text' })
  const lines = data.split(/\r?\n/)
  
  if (lines.length < 2) {
    throw new Error('CSV is empty or has no data rows')
  }
  
  const headers = splitCsvLine(lines[0]).map(h => h.trim())
  
  // Process rows to find first eligible product
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue
    
    const cols = splitCsvLine(raw)
    if (!cols.some(Boolean)) continue
    
    const rec = {}
    headers.forEach((h, idx) => { rec[h] = (cols[idx] ?? '').trim() })
    
    // Get jobId (required)
    const jobId = pickFirst(rec, ['jobId', 'job_id', 'wavespeed_job_id', 'WaveSpeed Job ID', 'WAVESPEED_JOB_ID', 'job', 'ASIN', 'SKU'])
    if (!jobId) continue
    
    // Check if already posted (skip if posted)
    const alwaysNew = String(process.env.ALWAYS_GENERATE_NEW_VIDEO || '').toLowerCase() === 'true'
    const posted = pickFirst(rec, ['Posted', 'posted'])
    if (!alwaysNew && posted && isTruthy(posted, process.env.CSV_STATUS_TRUE_VALUES)) {
      continue // Skip already posted
    }
    
    // Check if ready/enabled
    const ready = pickFirst(rec, ['Ready', 'ready', 'Status', 'status', 'Enabled', 'enabled', 'Post', 'post'])
    if (ready && !isTruthy(ready, process.env.CSV_STATUS_TRUE_VALUES)) {
      continue // Skip not ready
    }
    
    // Build product object
    const title = pickFirst(rec, ['title', 'name', 'product', 'Product', 'Title'])
    const details = pickFirst(rec, ['details', 'description', 'caption', 'Description', 'Details', 'Caption'])
    
    const product = {
      id: pickFirst(rec, ['id', 'ID']),
      name: pickFirst(rec, ['name', 'product', 'Product', 'Title']) || title,
      title: title || pickFirst(rec, ['name']),
      details: details,
      ...rec
    }
    
    return {
      product,
      jobId,
      rowNumber: i + 1, // Excel row number (1-indexed header + this row)
      headers,
      record: rec
    }
  }
  
  throw new Error('No eligible products found in CSV')
}

// ===== Step 3: Create HeyGen video =====
async function createHeyGenVideo(apiKey, product, script) {
  const apiEndpoint = process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com'
  const durationSeconds = Number(process.env.HEYGEN_VIDEO_DURATION_SECONDS || '30')
  
  // Map product to avatar/voice
  const textFields = [
    product.title, product.Title,
    product.name, product.Name,
    product.description, product.Description,
    product.details, product.Details
  ].filter(Boolean).join(' ')
  
  let avatar = process.env.HEYGEN_DEFAULT_AVATAR || 'garden_expert_01'
  let voice = process.env.HEYGEN_DEFAULT_VOICE || 'en_us_warm_female_01'
  
  // Simple keyword-based mapping
  if (/\b(kelp|seaweed|algae)\b/i.test(textFields)) {
    avatar = 'garden_expert_01'
    voice = 'en_us_warm_female_01'
  } else if (/\b(bone ?meal|bonemeal|bone)\b/i.test(textFields)) {
    avatar = 'farm_expert_02'
    voice = 'en_us_deep_male_01'
  }
  
  const payload = {
    script,
    avatar,
    voice,
    lengthSeconds: durationSeconds,
    music: { style: 'acoustic_nature', volume: 0.18 },
    subtitles: { enabled: true, style: 'short_lines' },
    webhook: process.env.HEYGEN_WEBHOOK_URL || undefined,
    title: `${product.title || product.name || 'Product Video'}`,
  }
  
  console.log(`🎬 Creating HeyGen video (${durationSeconds}s, avatar: ${avatar}, voice: ${voice})...`)
  
  const response = await axios.post(
    `${apiEndpoint}/v1/video.generate`,
    payload,
    {
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  )
  
  const jobId = response.data?.data?.video_id || response.data?.video_id || response.data?.jobId
  if (!jobId) {
    throw new Error('HeyGen API did not return a job ID')
  }
  
  return jobId
}

// ===== Step 4: Poll for video completion =====
async function pollForVideoUrl(apiKey, heygenJobId) {
  const apiEndpoint = process.env.HEYGEN_API_ENDPOINT || 'https://api.heygen.com'
  const timeoutMs = 25 * 60 * 1000 // 25 minutes
  const intervalMs = 15000 // 15 seconds
  const start = Date.now()
  
  console.log('⏳ Waiting for HeyGen video completion...')
  
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await axios.get(
        `${apiEndpoint}/v1/video_status.get?video_id=${heygenJobId}`,
        {
          headers: { 'X-Api-Key': apiKey },
          timeout: 30000
        }
      )
      
      const data = response.data?.data || response.data
      const status = (data?.status || '').toLowerCase()
      
      if (status.includes('complet') || status === 'success') {
        const videoUrl = data?.video_url || data?.videoUrl || data?.url
        if (videoUrl) {
          return videoUrl
        }
      }
      
      if (status.includes('fail') || status === 'error') {
        throw new Error(`HeyGen job failed: ${data?.error || data?.error_message || 'Unknown error'}`)
      }
      
      // Still processing
      process.stdout.write('.')
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    } catch (error) {
      if (error?.message?.includes('job failed')) {
        throw error
      }
      // Network error, retry
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
  }
  
  throw new Error(`HeyGen job timed out after ${timeoutMs / 1000}s`)
}

// ===== Step 5: Generate script with OpenAI =====
async function generateScript(product) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // Fall back to product description
    return product.details || product.description || product.title || product.name || ''
  }
  
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const prompt = `Write a concise 20-25 second video script for this garden product. Focus on benefits and value:

Product: ${product.title || product.name}
${product.details || product.description || ''}

Requirements:
- Natural, conversational tone
- 2-3 sentences maximum
- Focus on benefits, not features
- No call-to-action needed`
  
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    )
    
    return response.data?.choices?.[0]?.message?.content?.trim() || ''
  } catch (error) {
    console.warn('⚠️  OpenAI script generation failed, using product description')
    return product.details || product.description || product.title || product.name || ''
  }
}

// ===== Step 6: Write video URL back to sheet =====
async function writeVideoUrlToSheet(csvUrl, rowNumber, videoUrl) {
  const email = process.env.GS_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GS_SERVICE_ACCOUNT_KEY
  
  if (!email || !key) {
    console.log('⚠️  Google Sheets credentials not configured, skipping write-back')
    return
  }
  
  // Extract spreadsheet ID and gid from CSV URL
  const spreadsheetIdMatch = csvUrl.match(/\/spreadsheets\/d\/([^/]+)/)
  const gidMatch = csvUrl.match(/[?&]gid=(\d+)/)
  
  if (!spreadsheetIdMatch) {
    throw new Error('Unable to parse spreadsheet ID from CSV_URL')
  }
  
  const spreadsheetId = spreadsheetIdMatch[1]
  const sheetGid = gidMatch ? Number(gidMatch[1]) : 0
  
  // Use the column letter from env or default to AB
  const columnLetter = (process.env.SHEET_VIDEO_TARGET_COLUMN_LETTER || 'AB').toUpperCase()
  
  const { google } = await import('googleapis')
  
  const jwtClient = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })
  
  await jwtClient.authorize()
  const sheets = google.sheets({ version: 'v4', auth: jwtClient })
  
  // Get sheet title from gid
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const sheet = (meta.data.sheets || []).find(s => String(s.properties?.sheetId) === String(sheetGid))
  
  if (!sheet) {
    throw new Error(`Sheet with gid ${sheetGid} not found`)
  }
  
  const sheetTitle = sheet.properties.title
  const range = `${sheetTitle}!${columnLetter}${rowNumber}`
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[videoUrl]] }
  })
  
  console.log(`✅ Wrote video URL to ${range}`)
}

// ===== Main Execution =====
async function main() {
  try {
    // Step 1: Get CSV URL
    const csvUrl = process.env.CSV_URL
    if (!csvUrl) {
      throw new Error('CSV_URL environment variable not set')
    }
    
    // Step 2: Get first eligible product
    console.log('📊 Loading products from CSV...')
    const { product, jobId, rowNumber, headers, record } = await getFirstEligibleProduct(csvUrl)
    
    console.log(`📝 Found 1 product to process`)
    console.log(`   Product: ${product.title || product.name}`)
    console.log(`   Job ID: ${jobId}`)
    console.log(`   Row: ${rowNumber}`)
    console.log('')
    
    // Step 3: Get HeyGen API key
    const heygenApiKey = await getHeyGenApiKey()
    
    // Step 4: Generate script
    console.log('✍️  Generating video script...')
    const script = await generateScript(product)
    console.log(`✓ Script: ${script.substring(0, 100)}${script.length > 100 ? '...' : ''}`)
    console.log('')
    
    // Step 5: Create HeyGen video
    const heygenJobId = await createHeyGenVideo(heygenApiKey, product, script)
    console.log(`✅ Created HeyGen video job: ${heygenJobId}`)
    console.log('')
    
    // Step 6: Poll for completion
    const videoUrl = await pollForVideoUrl(heygenApiKey, heygenJobId)
    console.log('')
    console.log(`✅ Video ready: ${videoUrl}`)
    console.log('')
    
    // Step 7: Write back to sheet
    await writeVideoUrlToSheet(csvUrl, rowNumber, videoUrl)
    
    console.log('')
    console.log('✅ Video generation complete!')
    
  } catch (error) {
    console.error('')
    console.error('❌ Error:', error.message)
    if (error.stack) {
      console.error('')
      console.error('Stack trace:')
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
