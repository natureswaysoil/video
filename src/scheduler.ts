import cron from 'node-cron'
import { exec } from 'child_process'

function runPipeline() {
  console.log('🚀 Running video pipeline...')

  exec('npm run run:once', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Pipeline error:', error.message)
      return
    }
    if (stderr) {
      console.error('⚠️ Pipeline stderr:', stderr)
    }
    console.log('✅ Pipeline output:', stdout)
  })
}

const schedule = [
  '15 8 * * *',   // YouTube AM
  '30 11 * * *',  // Instagram AM
  '0 13 * * *',   // Facebook
  '15 18 * * *',  // Instagram PM
  '30 19 * * *',  // YouTube PM
]

console.log('⏰ Scheduler started...')

schedule.forEach((time) => {
  cron.schedule(time, () => {
    console.log(`⏱ Running scheduled job at ${time}`)
    runPipeline()
  })
})

// Run immediately on start
runPipeline()
