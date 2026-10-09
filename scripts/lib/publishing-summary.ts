export class PostingSkippedError extends Error {}

function cell(value: string) {
  return String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function publishingSummary(productId: string, platforms: string[], success: Record<string, boolean>, errors: Record<string, string>, skipped: Set<string>, ids: Record<string, string>) {
  const rows = platforms.map(platform => {
    const status = skipped.has(platform) ? 'Skipped' : success[platform] ? (errors[platform] ? 'Partial' : 'Posted') : 'Failed'
    return `| ${cell(platform)} | ${status} | ${cell(errors[platform] || '')} |`
  }).join('\n')
  return `\n### Social publishing: ${cell(productId)}\n\n| Platform | Result | Details |\n| --- | --- | --- |\n${rows}\n\nSuccessful post IDs:\n\n\`\`\`json\n${JSON.stringify(ids, null, 2)}\n\`\`\`\n`
}
