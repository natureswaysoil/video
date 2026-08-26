import express from 'express'
import axios from 'axios'
import crypto from 'crypto'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

const app = express()
app.use(express.json({ limit: '1mb' }))

const PORT = Number(process.env.PORT || 8080)
const QBO_ENV = String(process.env.QBO_ENV || 'sandbox').toLowerCase()
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || ''
const CLIENT_ID = process.env.QBO_CLIENT_ID || ''
const CLIENT_SECRET = process.env.QBO_CLIENT_SECRET || ''
const REDIRECT_URI = process.env.QBO_REDIRECT_URI || ''
const SECRET_PREFIX = process.env.QBO_SECRET_PREFIX || 'qbo'
const secretClient = new SecretManagerServiceClient()
const oauthStates = new Map()

const discovery = {
  auth: 'https://appcenter.intuit.com/connect/oauth2',
  token: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
  apiBase: QBO_ENV === 'production'
    ? 'https://quickbooks.api.intuit.com/v3/company'
    : 'https://sandbox-quickbooks.api.intuit.com/v3/company'
}

function assertConfig() {
  const missing = []
  if (!CLIENT_ID) missing.push('QBO_CLIENT_ID')
  if (!CLIENT_SECRET) missing.push('QBO_CLIENT_SECRET')
  if (!REDIRECT_URI) missing.push('QBO_REDIRECT_URI')
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`)
}

function basicAuth() {
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
}

async function accessSecret(id) {
  if (!PROJECT_ID) return process.env[id.toUpperCase().replace(/-/g, '_')] || ''
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/${id}/versions/latest`
    })
    return version.payload?.data?.toString() || ''
  } catch (error) {
    if (Number(error?.code) === 5) return ''
    throw error
  }
}

async function upsertSecret(id, value) {
  if (!PROJECT_ID) throw new Error('GOOGLE_CLOUD_PROJECT is required to persist OAuth tokens')
  const parent = `projects/${PROJECT_ID}`
  let exists = true
  try {
    await secretClient.getSecret({ name: `${parent}/secrets/${id}` })
  } catch (error) {
    if (Number(error?.code) !== 5) throw error
    exists = false
  }
  if (!exists) {
    await secretClient.createSecret({
      parent,
      secretId: id,
      secret: { replication: { automatic: {} } }
    })
  }
  await secretClient.addSecretVersion({
    parent: `${parent}/secrets/${id}`,
    payload: { data: Buffer.from(String(value), 'utf8') }
  })
}

async function getConnection() {
  const realmId = process.env.QBO_REALM_ID || await accessSecret(`${SECRET_PREFIX}-realm-id`)
  const refreshToken = process.env.QBO_REFRESH_TOKEN || await accessSecret(`${SECRET_PREFIX}-refresh-token`)
  return { realmId, refreshToken }
}

async function refreshAccessToken() {
  assertConfig()
  const { realmId, refreshToken } = await getConnection()
  if (!realmId || !refreshToken) throw new Error('QuickBooks is not authorized yet. Visit /oauth/start first.')
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  const response = await axios.post(discovery.token, body.toString(), {
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    timeout: 30000
  })
  const nextRefresh = response.data?.refresh_token || refreshToken
  if (nextRefresh !== refreshToken && PROJECT_ID) await upsertSecret(`${SECRET_PREFIX}-refresh-token`, nextRefresh)
  return { realmId, accessToken: response.data.access_token, refreshToken: nextRefresh }
}

async function qboRequest(method, path, data) {
  const { realmId, accessToken } = await refreshAccessToken()
  const url = `${discovery.apiBase}/${encodeURIComponent(realmId)}${path}`
  const response = await axios({
    method,
    url,
    data,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    timeout: 45000
  })
  return response.data
}

async function queryQbo(sql) {
  const encoded = encodeURIComponent(sql)
  return qboRequest('get', `/query?query=${encoded}`)
}

function money(value) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) throw new Error(`Invalid money value: ${value}`)
  return Math.round(n * 100) / 100
}

function buildSettlementLines(payload) {
  const sales = money(payload.productSales)
  const shipping = money(payload.shippingIncome)
  const refunds = money(payload.refunds)
  const referral = money(payload.referralFees)
  const fulfillment = money(payload.fulfillmentFees)
  const advertising = money(payload.advertising)
  const netDeposit = money(payload.netDeposit)

  const credits = sales + shipping
  const debitsWithoutDeposit = refunds + referral + fulfillment + advertising
  const expectedDeposit = money(credits - debitsWithoutDeposit)
  if (Math.abs(expectedDeposit - netDeposit) > 0.02) {
    throw new Error(`Settlement does not balance. Expected net deposit ${expectedDeposit.toFixed(2)} but received ${netDeposit.toFixed(2)}.`)
  }

  return {
    expectedDeposit,
    components: { sales, shipping, refunds, referral, fulfillment, advertising, netDeposit }
  }
}

async function resolveAccount(nameOrId) {
  const value = String(nameOrId || '').trim()
  if (!value) throw new Error('Missing QuickBooks account mapping')
  if (/^\d+$/.test(value)) return value
  const safe = value.replace(/'/g, "\\'")
  const result = await queryQbo(`select Id, Name from Account where Name = '${safe}' maxresults 1`)
  const account = result?.QueryResponse?.Account?.[0]
  if (!account?.Id) throw new Error(`QuickBooks account not found: ${value}`)
  return account.Id
}

async function accountMap() {
  const configured = {
    bank: process.env.QBO_ACCOUNT_BANK || 'Amazon Clearing',
    sales: process.env.QBO_ACCOUNT_SALES || 'Sales of Product Income',
    shippingIncome: process.env.QBO_ACCOUNT_SHIPPING_INCOME || 'Shipping Income',
    refunds: process.env.QBO_ACCOUNT_REFUNDS || 'Refunds-Allowances',
    referralFees: process.env.QBO_ACCOUNT_REFERRAL_FEES || 'Amazon Fees',
    fulfillmentFees: process.env.QBO_ACCOUNT_FULFILLMENT_FEES || 'Fulfillment Fees',
    advertising: process.env.QBO_ACCOUNT_ADVERTISING || 'Advertising'
  }
  const out = {}
  for (const [key, value] of Object.entries(configured)) out[key] = await resolveAccount(value)
  return out
}

function journalLine(amount, postingType, accountId, description) {
  if (!amount) return null
  return {
    Amount: Math.abs(money(amount)),
    Description: description,
    DetailType: 'JournalEntryLineDetail',
    JournalEntryLineDetail: {
      PostingType: postingType,
      AccountRef: { value: String(accountId) }
    }
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'natureswaysoil-quickbooks-automation', qboEnv: QBO_ENV })
})

app.get('/oauth/start', (req, res) => {
  try {
    assertConfig()
    const state = crypto.randomBytes(24).toString('hex')
    oauthStates.set(state, Date.now())
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: REDIRECT_URI,
      state
    })
    res.redirect(`${discovery.auth}?${params.toString()}`)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/oauth/callback', async (req, res) => {
  try {
    assertConfig()
    const { code, realmId, state, error } = req.query
    if (error) throw new Error(`Intuit authorization error: ${error}`)
    if (!code || !realmId || !state) throw new Error('Missing code, realmId, or state from Intuit callback')
    const createdAt = oauthStates.get(String(state))
    oauthStates.delete(String(state))
    if (!createdAt || Date.now() - createdAt > 10 * 60 * 1000) throw new Error('OAuth state is invalid or expired')

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: REDIRECT_URI
    })
    const token = await axios.post(discovery.token, body.toString(), {
      headers: {
        Authorization: `Basic ${basicAuth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      timeout: 30000
    })

    await upsertSecret(`${SECRET_PREFIX}-realm-id`, String(realmId))
    await upsertSecret(`${SECRET_PREFIX}-refresh-token`, String(token.data.refresh_token))
    res.type('html').send('<h2>QuickBooks connected successfully.</h2><p>You can close this page.</p>')
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/qbo/company', async (req, res) => {
  try {
    const { realmId } = await getConnection()
    if (!realmId) throw new Error('QuickBooks is not authorized yet')
    const data = await qboRequest('get', `/companyinfo/${encodeURIComponent(realmId)}`)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message })
  }
})

app.post('/qbo/settlement/preview', async (req, res) => {
  try {
    const result = buildSettlementLines(req.body || {})
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.post('/qbo/settlement', async (req, res) => {
  try {
    const payload = req.body || {}
    const { components } = buildSettlementLines(payload)
    const accounts = await accountMap()
    const source = String(payload.source || 'Marketplace')
    const reference = String(payload.reference || `${source}-${payload.date || new Date().toISOString().slice(0, 10)}`)
    const txnDate = String(payload.date || new Date().toISOString().slice(0, 10))

    const lines = [
      journalLine(components.netDeposit, 'Debit', accounts.bank, `${source} net deposit`),
      journalLine(components.refunds, 'Debit', accounts.refunds, `${source} refunds`),
      journalLine(components.referral, 'Debit', accounts.referralFees, `${source} referral/marketplace fees`),
      journalLine(components.fulfillment, 'Debit', accounts.fulfillmentFees, `${source} fulfillment fees`),
      journalLine(components.advertising, 'Debit', accounts.advertising, `${source} advertising`),
      journalLine(components.sales, 'Credit', accounts.sales, `${source} product sales`),
      journalLine(components.shipping, 'Credit', accounts.shippingIncome, `${source} shipping income`)
    ].filter(Boolean)

    const journal = {
      TxnDate: txnDate,
      DocNumber: reference.slice(0, 21),
      PrivateNote: `Automated ${source} settlement: ${reference}`,
      Line: lines
    }

    if (String(process.env.QBO_WRITE_ENABLED || 'false').toLowerCase() !== 'true') {
      return res.json({ ok: true, dryRun: true, message: 'QBO_WRITE_ENABLED is false; nothing posted.', journal })
    }

    const result = await qboRequest('post', '/journalentry', journal)
    res.json({ ok: true, dryRun: false, result })
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message })
  }
})

app.listen(PORT, () => {
  console.log(`QuickBooks automation listening on port ${PORT}`)
})
