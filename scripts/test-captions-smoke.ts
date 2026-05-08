import { captionsFromVoiceover } from '../src/multi-scene-broll'

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('❌ FAIL:', msg)
    process.exit(1)
  }
}

const voiceover =
  "Yellow lawn spots from your dog? Nature's Way Soil neutralizes urine and revives the soil. " +
  "It's pet-safe and works at the root zone. Spray it on, water it in, and watch your lawn recover. " +
  "Shop direct and save 15 percent today."

const captions = captionsFromVoiceover(voiceover, 30)

console.log(`Generated ${captions.length} caption lines for 30s voiceover`)
for (const c of captions.slice(0, 6)) {
  console.log(`  [${c.startSec.toFixed(1)}-${c.endSec.toFixed(1)}] ${c.text}`)
}

assert(captions.length > 0, 'Should produce at least one caption')
assert(captions[0].startSec === 0, 'First caption should start at 0')
assert(
  Math.abs(captions[captions.length - 1].endSec - 30) < 0.01,
  `Last caption should end near 30, got ${captions[captions.length - 1].endSec}`
)
assert(captions.every((c, i) => i === 0 || c.startSec >= captions[i - 1].endSec - 0.001), 'Captions must be monotonic')
assert(captions.every((c) => c.text.length <= 60), 'No caption line should exceed 60 chars')

console.log('✅ captionsFromVoiceover smoke test passed')
