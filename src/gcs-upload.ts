import { Storage } from '@google-cloud/storage'
import { getLogger } from './logger'
import { AppError, ErrorCode } from './errors'
import * as fs from 'fs'
import * as path from 'path'

const logger = getLogger()

export interface GcsUploadOptions {
  bucketName: string
  filePath: string
  destinationPath?: string
  makePublic?: boolean
}

export interface GcsUploadResult {
  publicUrl: string
  gsUrl: string
}

/**
 * Upload a file to Google Cloud Storage and optionally make it public
 */
export async function uploadToGcs(options: GcsUploadOptions): Promise<GcsUploadResult> {
  const { bucketName, filePath, destinationPath, makePublic = true } = options

  try {
    // Verify file exists
    if (!fs.existsSync(filePath)) {
      throw new AppError(
        `File not found: ${filePath}`,
        ErrorCode.VALIDATION_ERROR,
        400
      )
    }

    // Initialize Storage client
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)

    // Determine destination path
    const fileName = destinationPath || path.basename(filePath)
    const file = bucket.file(fileName)

    logger.info('Uploading file to GCS', 'GCS', {
      bucketName,
      fileName,
      filePath
    })

    // Upload file
    await bucket.upload(filePath, {
      destination: fileName,
      metadata: {
        contentType: getContentType(filePath)
      }
    })

    logger.info('File uploaded successfully', 'GCS', { fileName })

    // Make file public if requested
    if (makePublic) {
      await file.makePublic()
      logger.info('File made public', 'GCS', { fileName })
    }

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`
    const gsUrl = `gs://${bucketName}/${fileName}`

    logger.info('File available at public URL', 'GCS', { publicUrl })

    return {
      publicUrl,
      gsUrl
    }
  } catch (error: any) {
    logger.error('Failed to upload to GCS', 'GCS', {
      error: error.message,
      bucketName,
      filePath
    })

    throw new AppError(
      `GCS upload failed: ${error.message}`,
      ErrorCode.EXTERNAL_API_ERROR,
      500,
      { originalError: error }
    )
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  
  const contentTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska'
  }

  return contentTypes[ext] || 'application/octet-stream'
}
