export async function claimMarketingJob(jobId: string, campaignId: string, attempt: number, create: (key: string, value: string) => Promise<unknown>) {
  if (!/^[0-9a-f-]{36}$/.test(jobId)) throw new Error('Invalid marketing job ID')
  if (attempt !== 1) throw new Error('Marketing jobs cannot be rerun; reconcile previous publishing outcomes')
  await create(`state/marketing-jobs/${jobId}.json`, JSON.stringify({ jobId, campaignId, claimedAt: new Date().toISOString() }))
}
