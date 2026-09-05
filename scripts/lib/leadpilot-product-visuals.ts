// @ts-nocheck
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { ensureDir, hasUsableFile, safeFileName } from './video-utils'

export type LeadPilotVisual = 'dashboard' | 'gmail' | 'customers' | 'trial'

function escapeDrawtext(value: string) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
}

function fontFile() {
  const candidates = [
    process.env.DRAWTEXT_FONT || '',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
  ]
  return candidates.find((file) => file && fs.existsSync(file)) || ''
}

function draw(text: string, x: number | string, y: number, size = 44, color = 'white', extra = '') {
  const font = fontFile()
  const fontArg = font ? `fontfile='${font}':` : ''
  return `drawtext=${fontArg}text='${escapeDrawtext(text)}':x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}${extra}`
}

function box(x: number, y: number, w: number, h: number, color: string, radius = 0) {
  // drawbox has no rounded corners; the composition still reads like the actual LeadPilot cards.
  void radius
  return `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}:t=fill`
}

function commonChrome(title: string) {
  return [
    box(52, 110, 976, 1620, '#ffffff'),
    box(52, 110, 976, 118, '#14231c'),
    draw('Lead', 90, 143, 48, 'white'),
    draw('Pilot', 210, 143, 48, '#9de45a'),
    draw(title, 90, 275, 38, '#14231c'),
    draw('GreenView Landscaping', 90, 330, 24, '#68746e')
  ]
}

function dashboardFilters() {
  return [
    ...commonChrome('Lead dashboard'),
    box(90, 402, 210, 180, '#edf8f1'),
    draw('NEW LEADS', 112, 435, 22, '#68746e'),
    draw('8', 112, 475, 62, '#176b42'),
    box(322, 402, 210, 180, '#f6f8f6'),
    draw('QUALIFIED', 344, 435, 22, '#68746e'),
    draw('6', 344, 475, 62, '#14231c'),
    box(554, 402, 210, 180, '#f6f8f6'),
    draw('BOOKED', 576, 435, 22, '#68746e'),
    draw('3', 576, 475, 62, '#14231c'),
    box(786, 402, 202, 180, '#f6f8f6'),
    draw('INBOX', 808, 435, 22, '#68746e'),
    draw('0', 808, 475, 62, '#14231c'),
    draw('Recent leads', 90, 650, 32, '#14231c'),
    box(90, 706, 898, 105, '#f8faf8'),
    draw('James Carter', 116, 728, 25, '#14231c'),
    draw('Lawn maintenance · 21742', 116, 766, 20, '#68746e'),
    draw('95', 836, 735, 30, '#176b42'),
    box(90, 829, 898, 105, '#ffffff'),
    draw('Maria Johnson', 116, 851, 25, '#14231c'),
    draw('Landscape design · 21740', 116, 889, 20, '#68746e'),
    draw('90', 836, 858, 30, '#176b42'),
    box(90, 980, 898, 180, '#14231c'),
    draw('Gmail connected', 122, 1023, 29, '#9de45a'),
    draw('New customer inquiries can be organized automatically.', 122, 1075, 20, 'white'),
    draw('ONE PLACE FOR EVERY LEAD', 90, 1535, 34, '#176b42')
  ]
}

function gmailFilters() {
  return [
    ...commonChrome('Automatic inbox capture'),
    box(90, 410, 898, 190, '#edf8f1'),
    draw('GMAIL CONNECTED', 125, 448, 28, '#176b42'),
    draw('office@greenview.com', 125, 500, 25, '#14231c'),
    draw('Read-only inbox connection', 125, 545, 20, '#68746e'),
    draw('New inquiry detected', 90, 680, 30, '#14231c'),
    box(90, 735, 898, 220, '#f8faf8'),
    draw('From: homeowner@example.com', 120, 770, 21, '#68746e'),
    draw('Subject: Lawn service estimate', 120, 814, 24, '#14231c'),
    draw('Service: Lawn maintenance', 120, 868, 22, '#14231c'),
    draw('Lead score: 95', 120, 912, 22, '#176b42'),
    box(90, 1010, 898, 170, '#14231c'),
    draw('Lead saved to dashboard', 124, 1050, 27, '#9de45a'),
    draw('No forwarding rules. No spreadsheet.', 124, 1100, 21, 'white'),
    draw('JUST CONNECT GMAIL', 90, 1535, 34, '#176b42')
  ]
}

function customerFilters() {
  return [
    ...commonChrome('Customers'),
    draw('Your customer database', 90, 410, 30, '#14231c'),
    draw('Repeat inquiries stay connected to one customer.', 90, 458, 20, '#68746e'),
    box(90, 535, 898, 118, '#f8faf8'),
    draw('James Carter', 120, 560, 25, '#14231c'),
    draw('james@example.com · 240-555-0182', 120, 603, 19, '#68746e'),
    draw('2 leads · 1 job won', 760, 582, 20, '#176b42'),
    box(90, 671, 898, 118, '#ffffff'),
    draw('Maria Johnson', 120, 696, 25, '#14231c'),
    draw('maria@example.com · 301-555-0148', 120, 739, 19, '#68746e'),
    draw('1 lead · booked', 790, 718, 20, '#176b42'),
    box(90, 830, 898, 250, '#edf8f1'),
    draw('Customer history', 120, 870, 27, '#14231c'),
    draw('First contact', 120, 930, 20, '#68746e'),
    draw('Sep 1', 365, 930, 21, '#14231c'),
    draw('Last contact', 120, 980, 20, '#68746e'),
    draw('Today', 365, 980, 21, '#14231c'),
    draw('Lead count', 600, 930, 20, '#68746e'),
    draw('2', 820, 930, 21, '#14231c'),
    draw('Jobs won', 600, 980, 20, '#68746e'),
    draw('1', 820, 980, 21, '#14231c'),
    draw('YOUR DATABASE BUILDS ITSELF', 90, 1535, 34, '#176b42')
  ]
}

function trialFilters() {
  return [
    ...commonChrome('Simple setup'),
    box(90, 410, 898, 285, '#14231c'),
    draw('14 DAYS FREE', '(w-text_w)/2', 465, 60, '#9de45a'),
    draw('NO CREDIT CARD REQUIRED', '(w-text_w)/2', 550, 30, 'white'),
    draw('Setup takes about 5 minutes', '(w-text_w)/2', 610, 22, '#b8c4be'),
    draw('1. Add your business', 120, 790, 27, '#14231c'),
    draw('2. Choose your services', 120, 855, 27, '#14231c'),
    draw('3. Add simple pricing', 120, 920, 27, '#14231c'),
    box(90, 1010, 898, 125, '#edf8f1'),
    draw('4. Just connect your Gmail', 120, 1048, 28, '#176b42'),
    draw('No CRM migration required.', 120, 1092, 20, '#68746e'),
    box(90, 1230, 898, 120, '#176b42'),
    draw('START THE FREE TRIAL', '(w-text_w)/2', 1272, 29, 'white'),
    draw('START IN ABOUT 5 MINUTES', 90, 1535, 34, '#176b42')
  ]
}

export function inferLeadPilotVisual(scene: any): LeadPilotVisual | '' {
  const text = `${scene?.name || ''} ${scene?.caption || ''} ${scene?.voiceover || ''}`.toLowerCase()
  if (/gmail|inbox|email/.test(text)) return 'gmail'
  if (/customer|database|history|record|repeat inquiry/.test(text)) return 'customers'
  if (/trial|credit card|five minute|5 minute|setup|start free/.test(text)) return 'trial'
  if (/dashboard|pipeline|organized|organize|lead score|pricing/.test(text)) return 'dashboard'
  return ''
}

export function createLeadPilotProductVisual(kind: LeadPilotVisual, outputDir: string) {
  ensureDir(outputDir)
  const output = path.resolve(outputDir, safeFileName(`leadpilot-${kind}`, 'png'))
  const filters = kind === 'gmail'
    ? gmailFilters()
    : kind === 'customers'
      ? customerFilters()
      : kind === 'trial'
        ? trialFilters()
        : dashboardFilters()

  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=#f4f1e8:s=1080x1920:d=1',
    '-vf', filters.join(','),
    '-frames:v', '1', output
  ], { stdio: 'inherit' })

  if (!hasUsableFile(output)) throw new Error(`Could not create LeadPilot ${kind} product visual`)
  return output
}
