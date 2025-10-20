export type JobContext = {
  storyboardJobId?: string
  renderJobId?: string
  spreadsheetId: string
  sheetGid?: number
  rowNumber: number
  headers: string[]
  caption: string
  enabledPlatformsCsv?: string
  processed?: boolean
}

const byId = new Map<string, JobContext>()

export function addContext(storyboardJobId: string, ctx: JobContext) {
  byId.set(storyboardJobId, { ...ctx, storyboardJobId })
}

export function setRenderJobId(storyboardJobId: string, renderJobId: string) {
  const ctx = byId.get(storyboardJobId)
  if (ctx) {
    ctx.renderJobId = renderJobId
    byId.set(storyboardJobId, ctx)
    byId.set(renderJobId, ctx)
  }
}

export function resolveByJobId(jobId: string): JobContext | undefined {
  return byId.get(jobId)
}

export function markProcessed(jobId: string) {
  const ctx = byId.get(jobId)
  if (ctx) {
    ctx.processed = true
  }
}

export function isProcessed(jobId: string): boolean {
  const ctx = byId.get(jobId)
  return Boolean(ctx?.processed)
}
