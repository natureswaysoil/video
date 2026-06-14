import 'dotenv/config'
import axios from 'axios'
import { runBlogGeneration } from '../src/blog-generator'

const { execFileSync } = require('child_process')

function git(args: string[]) {
  execFileSync('git', args, { stdio: 'inherit' })
}

function latestBlogFile(): string {
  const file = execFileSync('bash', ['-lc', 'ls -t generated-blogs/*.json | head -1'])
    .toString()
    .trim()

  if (!file) throw new Error('No generated blog file found')
  return file
}

function slugFromFile(file: string): string {
  return file.split('/').pop()!.replace('.json', '')
}

async function postToFacebook(blog: any, url: string) {
  if (!process.env.FACEBOOK_PAGE_ACCESS_TOKEN || !process.env.FACEBOOK_PAGE_ID) {
    console.log('Facebook skipped - missing credentials')
    return
  }

  const message =
    blog.title +
    '\n\n' +
    (blog.excerpt || '') +
    '\n\nRead more: ' +
    url +
    '\n\n#NaturesWaySoil #OrganicGardening #SoilHealth'

  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${process.env.FACEBOOK_PAGE_ID}/feed`,
    {
      message,
      link: url,
      access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN
    }
  )

  console.log('Facebook posted:', res.data?.id)
}

async function main() {
  await runBlogGeneration()

  const file = latestBlogFile()
  const slug = slugFromFile(file)

  if (process.env.AUTO_GIT_COMMIT_BLOG === 'true') {
    git(['add', file])

    try {
      git(['diff', '--cached', '--quiet'])
      console.log('No new blog changes to commit')
    } catch {
      git(['commit', '-m', `Add blog article: ${slug}`])
      git(['pull', '--ff-only'])
      git(['push'])
    }
  }

  if (process.env.ENABLE_BLOG_SOCIAL_POSTING === 'true') {
    const fs = await import('fs')
    const blog = JSON.parse(fs.readFileSync(file, 'utf8'))
    const base = process.env.BLOG_BASE_URL || 'https://natureswaysoil.com/blog'
    const url = `${base.replace(/\/$/, '')}/${blog.slug || slug}`

    await postToFacebook(blog, url)
  }
}

main().catch((error) => {
  console.error('Blog auto publish failed:', error?.message || error)
  process.exit(1)
})