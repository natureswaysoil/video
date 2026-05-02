// @ts-nocheck
import cron from 'node-cron'
import { exec } from 'child_process'

function runCommand(label: string, command: string) {
  console.log(`🚀 ${label}... (${command})`)

  exec(command, (error: any, stdout: string, stderr: string) => {
    if (error) {
      console.error(`❌ ${label} error:`, error.message)
      return
    }
    if (stderr) {
      console.error(`⚠️ ${label} stderr:`, stderr)
    }
    console.log(`✅ ${label} output:`, stdout)
  })
}

function runPipeline() {
  const pipelineCommand = process.env.SCHEDULER_PIPELINE_COMMAND || 'npm run run:once'
  runCommand('Running pipeline', pipelineCommand)
}

function generateRows() {
  const generateRowsCommand = process.env.SCHEDULER_GENERATE_ROWS_COMMAND || 'npm run generate:rows'
  runCommand('Generating new content rows', generateRowsCommand)
}

const schedule = (process.env.SCHEDULER_POST_TIMES || '15 8 * * *,30 11 * * *,0 13 * * *,15 18 * * *,30 19 * * *')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const isTestVideoMode = String(process.env.TEST_VIDEO_CAMPAIGN_MODE || 'false').toLowerCase() === 'true'

if (!isTestVideoMode) {
  const rowGenerationCron = process.env.SCHEDULER_ROW_GENERATION_CRON || '0 7 * * *'
  cron.schedule(rowGenerationCron, () => {
    console.log('🌅 Morning row generation triggered')
    generateRows()
  })
}

console.log('⏰ Scheduler started...')
console.log('Schedule:', schedule)
console.log('TEST_VIDEO_CAMPAIGN_MODE:', isTestVideoMode)

schedule.forEach((time) => {
  cron.schedule(time, () => {
    console.log(`⏱ Running scheduled job at ${time}`)
    runPipeline()
  })
})

// Run immediately on start
runPipeline()
