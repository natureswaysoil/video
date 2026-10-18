import { AppError, ErrorCode } from './errors'
import { automaticXPostingAllowed, XPostingDisabledError } from './x-posting-policy'
import { publishFundedXVideo } from './x-funded-publisher'

const MAX_TWEET_LENGTH = 280

export function fitTweetText(value: string): string {
  const text = value.trim()
  if (text.length <= MAX_TWEET_LENGTH) return text
  return `${text.slice(0, MAX_TWEET_LENGTH - 3).trimEnd()}...`
}

export function fitTweetTextWithUrl(caption: string, url: string): string {
  const suffix = `\n${url.trim()}`
  const available = MAX_TWEET_LENGTH - suffix.length
  if (available <= 3) return fitTweetText(url)
  const text = caption.trim()
  const fitted = text.length <= available
    ? text
    : `${text.slice(0, available - 3).trimEnd()}...`
  return `${fitted}${suffix}`
}

export function getTwitterErrorStatus(error: unknown): number | undefined {
  const candidate =
    (error as any)?.response?.status ??
    (error as any)?.data?.status ??
    (error as any)?.code
  const status = Number(candidate)
  return Number.isFinite(status) ? status : undefined
}

export function isRetryableTwitterError(error: unknown): boolean {
  if (error instanceof AppError && error.code === ErrorCode.VALIDATION_ERROR) {
    return false
  }

  const status = getTwitterErrorStatus(error)
  if (status === undefined) return true
  if (status === 429) return true
  return status >= 500
}

// Legacy callers use the same funded app and account checks as the scheduler.
// No bearer fallback or automatic post retry is allowed.
export async function postToTwitter(videoUrl: string, caption: string, _bearerToken?: string): Promise<string> {
  if (!automaticXPostingAllowed()) throw new XPostingDisabledError()
  const result = await publishFundedXVideo(videoUrl, fitTweetText(caption))
  return result.tweetId
}
