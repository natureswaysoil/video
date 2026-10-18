// Owner policy, October 18, 2026: X posting must incur no API charges.
// Manual uploads through x.com remain available. Neither OAuth version nor
// switching upload endpoints establishes free API access on a pay-per-use app.
export const MANUAL_X_POSTING_REASON = 'X API posting disabled by owner: upload the generated video manually to @JamesJones90703 on x.com for free posting.'

export function automaticXPostingAllowed(): boolean {
  return false
}

export class XPostingDisabledError extends Error {
  constructor() {
    super(MANUAL_X_POSTING_REASON)
    this.name = 'XPostingDisabledError'
  }
}
