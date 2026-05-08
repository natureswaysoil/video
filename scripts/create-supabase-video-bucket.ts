// @ts-nocheck
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { loadSecretsToEnv } from '../src/secret-manager'

const SECRET_NAMES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_VIDEO_BUCKET',
]

function pickFirstEnv(keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return ''
}

async function main() {
  await loadSecretsToEnv(SECRET_NAMES)

  const supabaseUrl = pickFirstEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'])
  const serviceRoleKey = pickFirstEnv(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'])
  const bucketName = pickFirstEnv(['SUPABASE_VIDEO_BUCKET']) || 'test-videos'

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  if (listError) throw new Error(`Could not list Supabase buckets: ${listError.message}`)

  const exists = (buckets || []).some((bucket: any) => bucket.name === bucketName)
  if (exists) {
    console.log(`✅ Supabase bucket already exists: ${bucketName}`)
    return
  }

  // Do not force a custom fileSizeLimit here. Some Supabase projects reject
  // limits larger than the plan allows. Let the project default apply.
  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: true,
    allowedMimeTypes: ['video/mp4'],
  })

  if (createError) throw new Error(`Could not create Supabase bucket ${bucketName}: ${createError.message}`)

  console.log(`✅ Created public Supabase video bucket: ${bucketName}`)
}

main().catch((error) => {
  console.error('❌ Supabase bucket setup failed:', error?.message || error)
  process.exit(1)
})
