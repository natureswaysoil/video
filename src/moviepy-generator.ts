import { getLogger } from './logger'
import { AppError, ErrorCode } from './errors'
import { uploadToGcs } from './gcs-upload'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { spawn } from 'child_process'

const logger = getLogger()

// Get script path for Python script
const getScriptPath = (): string => {
  // In CommonJS modules, __dirname is available
  // In compiled dist, we're in dist/ and scripts/ is at the same level as dist/
  if (typeof __dirname !== 'undefined') {
    return __dirname
  }
  // Fallback to process.cwd()
  return process.cwd()
}

export interface MoviePyGeneratorOptions {
  script: string
  productTitle: string
  pexelsApiKey: string
  gcsBucketName: string
  searchQuery?: string
  productImageUrl?: string
}

export interface MoviePyGeneratorResult {
  videoUrl: string
  gsUrl: string
}

/**
 * Generate a video using free tools: Pexels for stock video, gTTS for voiceover, and MoviePy for composition
 */
export async function generateVideoWithMoviePy(
  options: MoviePyGeneratorOptions
): Promise<MoviePyGeneratorResult> {
  const { script, productTitle, pexelsApiKey, gcsBucketName, searchQuery, productImageUrl } = options

  // Create temporary directory for this video generation
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moviepy-'))
  const videoPath = path.join(tempDir, 'stock-video.mp4')
  const audioPath = path.join(tempDir, 'voiceover.mp3')
  const outputPath = path.join(tempDir, 'final-video.mp4')
  const productImagePath = productImageUrl ? path.join(tempDir, 'product-image.jpg') : undefined

  try {
    logger.info('Starting free video generation', 'MoviePy', {
      productTitle,
      searchQuery: searchQuery || productTitle
    })

    // Step 1: Download stock video from Pexels
    await downloadPexelsVideo({
      apiKey: pexelsApiKey,
      searchQuery: searchQuery || productTitle,
      outputPath: videoPath
    })

    // Step 1b: Download product image if URL provided
    if (productImageUrl && productImagePath) {
      try {
        await downloadProductImage({
          imageUrl: productImageUrl,
          outputPath: productImagePath
        })
        logger.info('Product image downloaded', 'MoviePy', { productImagePath })
      } catch (error: any) {
        logger.warn('Failed to download product image, continuing without it', 'MoviePy', {
          error: error.message
        })
        // Continue without product image - it's optional
      }
    }

    // Step 2: Generate voiceover with ElevenLabs or gTTS fallback
    await generateVoiceover({
      script,
      outputPath: audioPath
    })

    // Step 3: Compose video with MoviePy
    await composeVideoWithMoviePy({
      videoPath,
      audioPath,
      outputPath,
      productTitle,
      productImagePath: productImagePath && fs.existsSync(productImagePath) ? productImagePath : undefined
    })

    // Step 4: Upload to Google Cloud Storage
    // Generate unique filename with timestamp and random suffix
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const timestamp = Date.now()
    const uploadResult = await uploadToGcs({
      bucketName: gcsBucketName,
      filePath: outputPath,
      destinationPath: `videos/${timestamp}-${randomSuffix}-${sanitizeFilename(productTitle)}.mp4`,
      makePublic: true
    })

    logger.info('Video generation complete', 'MoviePy', {
      publicUrl: uploadResult.publicUrl
    })

    return {
      videoUrl: uploadResult.publicUrl,
      gsUrl: uploadResult.gsUrl
    }
  } catch (error: any) {
    logger.error('Video generation failed', 'MoviePy', {
      error: error.message
    })
    throw error
  } finally {
    // Clean up temporary files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
      logger.debug('Cleaned up temporary files', 'MoviePy', { tempDir })
    } catch (e) {
      logger.warn('Failed to clean up temporary files', 'MoviePy', {
        tempDir,
        error: (e as Error).message
      })
    }
  }
}

/**
 * Download a stock video from Pexels
 */
async function downloadPexelsVideo(options: {
  apiKey: string
  searchQuery: string
  outputPath: string
}): Promise<void> {
  const { apiKey, searchQuery, outputPath } = options

  try {
    logger.info('Searching Pexels for stock video', 'Pexels', { searchQuery })

    // Search for videos
    const searchResponse = await axios.get('https://api.pexels.com/videos/search', {
      headers: {
        Authorization: apiKey
      },
      params: {
        query: searchQuery,
        per_page: 5,
        orientation: 'landscape'
      },
      timeout: 30000
    })

    const videos = searchResponse.data?.videos || []
    
    if (videos.length === 0) {
      // Fallback to generic search if no results
      logger.warn('No videos found for query, using fallback', 'Pexels', {
        originalQuery: searchQuery,
        fallbackQuery: 'garden plants'
      })

      const fallbackResponse = await axios.get('https://api.pexels.com/videos/search', {
        headers: {
          Authorization: apiKey
        },
        params: {
          query: 'garden plants',
          per_page: 5,
          orientation: 'landscape'
        },
        timeout: 30000
      })

      const fallbackVideos = fallbackResponse.data?.videos || []
      if (fallbackVideos.length === 0) {
        throw new AppError(
          'No stock videos found from Pexels',
          ErrorCode.PROCESSING_ERROR,
          500
        )
      }

      videos.push(...fallbackVideos)
    }

    // Get the first HD video
    const video = videos[0]
    const hdFile = video.video_files?.find((f: any) => 
      f.quality === 'hd' || f.quality === 'sd'
    ) || video.video_files?.[0]

    if (!hdFile?.link) {
      throw new AppError(
        'No downloadable video file found',
        ErrorCode.PROCESSING_ERROR,
        500
      )
    }

    logger.info('Downloading video from Pexels', 'Pexels', {
      videoId: video.id,
      quality: hdFile.quality,
      url: hdFile.link
    })

    // Download the video
    const videoResponse = await axios.get(hdFile.link, {
      responseType: 'stream',
      timeout: 120000 // 2 minutes for download
    })

    const writer = fs.createWriteStream(outputPath)
    videoResponse.data.pipe(writer)

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
    })

    logger.info('Video downloaded successfully', 'Pexels', { outputPath })
  } catch (error: any) {
    logger.error('Failed to download Pexels video', 'Pexels', {
      error: error.message
    })

    throw new AppError(
      `Pexels download failed: ${error.message}`,
      ErrorCode.PROCESSING_ERROR,
      500,
      true,
      { searchQuery },
      error
    )
  }
}

/**
 * Generate voiceover using gTTS (Google Text-to-Speech)
 */
async function generateVoiceoverWithGtts(options: {
  script: string
  outputPath: string
}): Promise<void> {
  const { script, outputPath } = options

  try {
    logger.info('Generating voiceover with gTTS', 'gTTS', {
      scriptLength: script.length
    })

    // Use gtts-cli command with stdin to avoid shell injection
    await new Promise<void>((resolve, reject) => {
      const gttsProcess = spawn('gtts-cli', [
        '--output', outputPath,
        '--lang', 'en',
        '--tld', 'com',
        '-'  // Read from stdin
      ])

      let stderr = ''

      gttsProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      gttsProcess.on('close', (code: number | null) => {
        if (code === 0) {
          logger.info('Voiceover generated successfully', 'gTTS', { outputPath })
          resolve()
        } else {
          reject(new Error(`gTTS failed with code ${code}: ${stderr}`))
        }
      })

      gttsProcess.on('error', (err: Error) => {
        reject(new Error(`Failed to spawn gtts-cli: ${err.message}`))
      })

      // Write script to stdin
      gttsProcess.stdin.write(script)
      gttsProcess.stdin.end()
    })
  } catch (error: any) {
    logger.error('Failed to generate voiceover', 'gTTS', {
      error: error.message
    })

    throw new AppError(
      `gTTS voiceover generation failed: ${error.message}`,
      ErrorCode.PROCESSING_ERROR,
      500,
      true,
      { scriptLength: script.length },
      error
    )
  }
}

/**
 * Generate voiceover using ElevenLabs API
 */
async function generateVoiceoverWithElevenLabs(options: {
  script: string
  outputPath: string
}): Promise<void> {
  const { script, outputPath } = options
  const apiKey = process.env.ELEVENLABS_API_KEY
  // Default voice ID is for 'Sarah' - see https://elevenlabs.io/voice-library for other voices
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'

  try {
    logger.info('Generating voiceover with ElevenLabs', 'ElevenLabs', {
      scriptLength: script.length,
      voiceId
    })

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: script,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer',
        timeout: 60000
      }
    )

    const buffer = Buffer.from(response.data)
    fs.writeFileSync(outputPath, buffer)
    logger.info('ElevenLabs voiceover generated successfully', 'ElevenLabs', { outputPath })
  } catch (error: any) {
    logger.error('Failed to generate ElevenLabs voiceover', 'ElevenLabs', {
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText
    })

    throw new AppError(
      `ElevenLabs voiceover generation failed: ${error.message}`,
      ErrorCode.PROCESSING_ERROR,
      500,
      true,
      { scriptLength: script.length },
      error
    )
  }
}

/**
 * Generate voiceover with ElevenLabs or fallback to gTTS
 */
async function generateVoiceover(options: {
  script: string
  outputPath: string
}): Promise<void> {
  const { script, outputPath } = options
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY

  // Try ElevenLabs first if API key is available
  if (elevenLabsApiKey) {
    try {
      await generateVoiceoverWithElevenLabs({ script, outputPath })
      return
    } catch (error: any) {
      logger.warn('ElevenLabs failed, falling back to gTTS', 'MoviePy', {
        error: error.message
      })
      // Fall through to gTTS
    }
  }

  // Fallback to gTTS
  await generateVoiceoverWithGtts({ script, outputPath })
}

/**
 * Download product image from URL
 */
async function downloadProductImage(options: {
  imageUrl: string
  outputPath: string
}): Promise<void> {
  const { imageUrl, outputPath } = options

  try {
    logger.info('Downloading product image', 'MoviePy', { imageUrl })

    // Validate URL format
    try {
      new URL(imageUrl)
    } catch {
      throw new Error('Invalid image URL format')
    }

    // Download the image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024, // 10MB max
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VideoGenerator/1.0)'
      }
    })

    // Validate content type
    const contentType = response.headers['content-type']
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}`)
    }

    const buffer = Buffer.from(response.data)
    fs.writeFileSync(outputPath, buffer)
    logger.info('Product image downloaded successfully', 'MoviePy', { outputPath })
  } catch (error: any) {
    logger.error('Failed to download product image', 'MoviePy', {
      error: error.message,
      imageUrl
    })

    throw new AppError(
      `Product image download failed: ${error.message}`,
      ErrorCode.PROCESSING_ERROR,
      500,
      true,
      { imageUrl },
      error
    )
  }
}

/**
 * Compose final video using MoviePy Python script
 */
async function composeVideoWithMoviePy(options: {
  videoPath: string
  audioPath: string
  outputPath: string
  productTitle: string
  productImagePath?: string
}): Promise<void> {
  const { videoPath, audioPath, outputPath, productTitle, productImagePath } = options

  try {
    logger.info('Composing video with MoviePy', 'MoviePy', {
      videoPath,
      audioPath,
      productTitle,
      hasProductImage: !!productImagePath
    })

    // Write config to temporary file to avoid command-line length limits and injection
    const configPath = path.join(os.tmpdir(), `moviepy-config-${Date.now()}.json`)
    const config = {
      videoPath,
      audioPath,
      outputPath,
      productTitle,
      productImagePath: productImagePath || null
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config))

    // Use environment variable for script path or fall back to relative path
    const scriptPath = process.env.MOVIEPY_SCRIPT_PATH || 
      path.join(getScriptPath(), '..', 'scripts', 'generate-video.py')

    try {
      await new Promise<void>((resolve, reject) => {
        const pythonProcess = spawn('python3', [scriptPath, configPath])

        let stdout = ''
        let stderr = ''

        pythonProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString()
        })

        pythonProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })

        pythonProcess.on('close', (code: number | null) => {
          if (code === 0) {
            try {
              const result = JSON.parse(stdout)
              if (result.success) {
                logger.info('Video composed successfully', 'MoviePy', {
                  outputPath: result.outputPath
                })
                resolve()
              } else {
                reject(new Error(result.error || 'Unknown error from Python script'))
              }
            } catch (e) {
              reject(new Error(`Failed to parse Python output: ${stdout}`))
            }
          } else {
            reject(new Error(`MoviePy failed with code ${code}: ${stderr}`))
          }
        })

        pythonProcess.on('error', (err: Error) => {
          reject(new Error(`Failed to spawn Python: ${err.message}`))
        })
      })
    } finally {
      // Clean up config file
      try {
        fs.unlinkSync(configPath)
      } catch (e) {
        logger.warn('Failed to delete config file', 'MoviePy', { configPath })
      }
    }
  } catch (error: any) {
    logger.error('Failed to compose video', 'MoviePy', {
      error: error.message
    })

    throw new AppError(
      `MoviePy composition failed: ${error.message}`,
      ErrorCode.PROCESSING_ERROR,
      500,
      true,
      { productTitle },
      error
    )
  }
}

/**
 * Sanitize filename to remove invalid characters
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9\-_]/gi, '-')
    .replace(/-+/g, '-')
    .substring(0, 100)
}
