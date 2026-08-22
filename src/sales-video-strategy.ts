import fs from 'fs'
import path from 'path'

type Strategy = { match: string[]; priority: number; hook: string; problem: string; proofCue: string; cta: string; visualQueries: string[] }
const CONFIG = path.resolve(process.cwd(), 'config/sales-priority.json')
function load(): Strategy[] { try { const parsed = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); return Array.isArray(parsed?.products) ? parsed.products : [] } catch { return [] } }
export function getSalesVideoStrategy(product: any): Strategy | null {
  const text = [product?.title, product?.name, product?.description, product?.details, product?.category].filter(Boolean).join(' ').toLowerCase()
  const candidates = load().filter((rule) => rule.match.some((term) => text.includes(term.toLowerCase())))
  candidates.sort((a, b) => b.priority - a.priority)
  return candidates[0] || null
}
export function applySalesVideoStrategy(product: any) {
  const strategy = getSalesVideoStrategy(product)
  if (!strategy) return product
  const details = [product?.details || product?.description || '', `Sales hook: ${strategy.hook}`, `Customer problem: ${strategy.problem}`, `Trust cue: ${strategy.proofCue}`, `Required CTA: ${strategy.cta}`].filter(Boolean).join(' ')
  return { ...product, details, salesPriority: strategy.priority, salesHook: strategy.hook, salesProblem: strategy.problem, salesProofCue: strategy.proofCue, salesCta: strategy.cta, brollQueries: [...strategy.visualQueries, ...(product?.brollQueries || [])] }
}
