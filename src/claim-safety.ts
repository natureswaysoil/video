import { AppError, ErrorCode } from './errors'

export type ClaimSafetyResult = {
  ok: boolean
  blockedTerms: string[]
  warnings: string[]
}

const restrictedTerms = [
  'guaranteed',
  'instant',
  'cure',
  'disease',
  'epa approved',
  'omri listed',
  'certified organic',
  '100% organic',
  '100 percent organic',
  'one hundred percent organic',
  'safe for all pets',
  'non-toxic',
]

const cautionTerms = [
  'all plants',
  'will restore',
  'fixes',
  'prevents',
]

function containsTerm(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase())
}

export function checkMarketingClaims(text: string): ClaimSafetyResult {
  const safeText = String(text || '')
  const blockedTerms = restrictedTerms.filter((term) => containsTerm(safeText, term))
  const warnings = cautionTerms.filter((term) => containsTerm(safeText, term))
  return { ok: blockedTerms.length === 0, blockedTerms, warnings }
}

export function assertMarketingClaimsSafe(text: string, context: Record<string, unknown> = {}): void {
  const result = checkMarketingClaims(text)
  if (!result.ok) {
    throw new AppError(
      `Marketing claim safety check failed: ${result.blockedTerms.join(', ')}`,
      ErrorCode.VALIDATION_ERROR,
      400,
      true,
      { ...context, blockedTerms: result.blockedTerms, warnings: result.warnings, preview: text.slice(0, 300) }
    )
  }
}
