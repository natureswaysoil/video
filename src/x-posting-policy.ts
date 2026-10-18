// Paid posting is explicitly opted in per workflow after owner approval.
// Manual uploads through x.com remain available. Neither OAuth version nor
// switching upload endpoints establishes free API access on a pay-per-use app.
export const MANUAL_X_POSTING_REASON = 'X API posting disabled by owner: upload the generated video manually to @JamesJones90703 on x.com for free posting.'

export function automaticXPostingAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.X_PAID_POSTING_ENABLED === 'true'
}

export class XPostingDisabledError extends Error {
  constructor() {
    super(MANUAL_X_POSTING_REASON)
    this.name = 'XPostingDisabledError'
  }
}
