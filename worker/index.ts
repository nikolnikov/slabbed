export interface Env {
  DB: D1Database
  IMAGES: R2Bucket
  AI: Ai
  ASSETS: Fetcher
  SESSION_SECRET: string
  EBAY_CLIENT_ID?: string
  EBAY_CLIENT_SECRET?: string
}

type UserRow = {
  id: string
  email: string
  password_hash: string
  password_salt: string
  name: string
  share_collection: number
  share_wishlist: number
  avatar_image: string | null
}

type CardRow = {
  id: string
  user_id: string
  list: CardList
  is_graded: number
  cert_number: string | null
  grade: number | null
  grade_label: string | null
  sport: string | null
  year: string | null
  brand: string | null
  card_number: string | null
  player: string
  variety: string | null
  population: number | null
  population_higher: number | null
  notes: string | null
  front_image: string | null
  back_image: string | null
  created_at: string
  updated_at: string
}

type CardList = 'collection' | 'wishlist'

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

const SESSION_COOKIE = 'session'
const REMEMBER_ME_MAX_AGE = 60 * 60 * 24 * 365 // 1 year
const DEFAULT_MAX_AGE = 60 * 60 * 24 // 1 day
const PBKDF2_ITERATIONS = 100_000
const MIN_PASSWORD_LENGTH = 8
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
// Workers send no User-Agent by default, which some bot filters reject.
const OUTBOUND_HEADERS = { 'User-Agent': 'Slabbbed/1.0 (+https://app.slabbbed.com)' }
const EBAY_API_BASE = 'https://api.ebay.com'
// "Sports Trading Card Singles", so searches skip boxes, packs and lots.
const EBAY_CARD_CATEGORY = '261328'
// eBay serves listing photos from one host; the image proxy fetches nothing else.
const EBAY_IMAGE_HOST = 'i.ebayimg.com'

const jsonResponse = (data: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

const userToProfile = (user: UserRow) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  shareCollection: user.share_collection === 1,
  shareWishlist: user.share_wishlist === 1,
  avatarImage: user.avatar_image,
})

const rowToCard = (row: CardRow) => ({
  id: row.id,
  list: row.list,
  isGraded: row.is_graded === 1,
  certNumber: row.cert_number,
  grade: row.grade,
  gradeLabel: row.grade_label,
  sport: row.sport,
  year: row.year,
  brand: row.brand,
  cardNumber: row.card_number,
  player: row.player,
  variety: row.variety,
  population: row.population,
  populationHigher: row.population_higher,
  notes: row.notes,
  frontImage: row.front_image,
  backImage: row.back_image,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

// --- Auth helpers ---

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

const hashPassword = async (password: string, saltHex: string): Promise<string> => {
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  return toHex(new Uint8Array(bits))
}

const hmacKey = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])

const createSessionToken = async (userId: string, maxAgeSeconds: number, secret: string): Promise<string> => {
  const payload = JSON.stringify({ uid: userId, exp: Date.now() + maxAgeSeconds * 1000 })
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${toBase64Url(new Uint8Array(signature))}`
}

const verifySessionToken = async (token: string, secret: string): Promise<string | null> => {
  const [payloadB64, signature] = token.split('.')
  if (!payloadB64 || !signature) return null
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret, 'verify'),
      fromBase64Url(signature),
      new TextEncoder().encode(payloadB64)
    )
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as { uid: string; exp: number }
    if (payload.exp < Date.now()) return null
    return payload.uid
  } catch {
    return null
  }
}

const parseCookies = (header: string | null): Record<string, string> => {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key) cookies[key] = rest.join('=')
  }
  return cookies
}

const buildSessionCookie = (token: string, maxAgeSeconds: number, secure: boolean): string => {
  const parts = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

const buildLogoutCookie = (secure: boolean): string => buildSessionCookie('', 0, secure)

const requireUserId = async (request: Request, env: Env): Promise<string> => {
  const token = parseCookies(request.headers.get('Cookie'))[SESSION_COOKIE]
  const userId = token ? await verifySessionToken(token, env.SESSION_SECRET) : null
  if (!userId) throw new HttpError(401, 'Not authenticated')
  return userId
}

const startSession = async (user: UserRow, rememberMe: boolean, env: Env, secure: boolean): Promise<Response> => {
  const maxAge = rememberMe ? REMEMBER_ME_MAX_AGE : DEFAULT_MAX_AGE
  const token = await createSessionToken(user.id, maxAge, env.SESSION_SECRET)
  return jsonResponse({ profile: userToProfile(user) }, 200, {
    'Set-Cookie': buildSessionCookie(token, maxAge, secure),
  })
}

// --- Input helpers ---

const readJson = async <T>(request: Request): Promise<T> => {
  try {
    return await request.json<T>()
  } catch {
    throw new HttpError(400, 'Invalid request body')
  }
}

const text = (value: unknown, max = 200): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

// --- Photo search (eBay Browse API) ---

type PhotoResult = { id: string; title: string; thumbnailUrl: string; imageUrl: string; listingUrl: string | null }

// Application tokens last about two hours; reuse one per isolate until shortly before it expires.
let ebayToken: { value: string; expiresAt: number } | null = null

const getEbayToken = async (env: Env): Promise<string> => {
  if (ebayToken && ebayToken.expiresAt > Date.now()) return ebayToken.value
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) throw new HttpError(503, 'Photo search is not configured')

  const res = await fetch(`${EBAY_API_BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      ...OUTBOUND_HEADERS,
      Authorization: `Basic ${btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  })
  if (!res.ok) {
    console.error('eBay token request failed', res.status, await res.text())
    throw new HttpError(502, 'Photo search is unavailable right now')
  }
  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number }
  ebayToken = { value: access_token, expiresAt: Date.now() + (expires_in - 300) * 1000 }
  return access_token
}

type EbayItemSummary = {
  itemId?: string
  title?: string
  itemWebUrl?: string
  image?: { imageUrl?: string }
}

// Search results carry small thumbnails (s-l225); the same path serves up to 1600px.
const largeEbayImage = (imageUrl: string) => imageUrl.replace(/\/s-l\d+\./, '/s-l1600.')

const searchEbayPhotos = async (env: Env, query: string): Promise<PhotoResult[]> => {
  const params = new URLSearchParams({ q: query, category_ids: EBAY_CARD_CATEGORY, limit: '24' })
  const res = await fetch(`${EBAY_API_BASE}/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      ...OUTBOUND_HEADERS,
      Authorization: `Bearer ${await getEbayToken(env)}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
  })
  if (res.status === 429) throw new HttpError(429, 'Photo search limit reached. Try again later.')
  if (!res.ok) {
    console.error('eBay search failed', res.status, await res.text())
    throw new HttpError(502, 'Photo search is unavailable right now')
  }

  const { itemSummaries = [] } = (await res.json()) as { itemSummaries?: EbayItemSummary[] }
  return itemSummaries.flatMap((item) => {
    const imageUrl = item.image?.imageUrl
    if (!item.itemId || !imageUrl || new URL(imageUrl).hostname !== EBAY_IMAGE_HOST) return []
    return [
      {
        id: item.itemId,
        title: item.title ?? '',
        thumbnailUrl: imageUrl,
        imageUrl: largeEbayImage(imageUrl),
        listingUrl: item.itemWebUrl ?? null,
      },
    ]
  })
}

// --- Images ---

const newImageKey = (userId: string) => `${userId}/${crypto.randomUUID()}`

// Photos are optimized to WebP in the browser before upload, so a card may only reference keys
// the user already uploaded through /api/images.
const resolveImage = (ref: unknown, userId: string): string | null => {
  if (typeof ref !== 'string' || !ref) return null
  if (!new RegExp(`^${userId}/[\\w-]+$`).test(ref)) throw new HttpError(400, 'Invalid image reference')
  return ref
}

// Checks the file signature, since the Content-Type header is whatever the client claims.
const sniffImageType = (data: ArrayBuffer): 'image/webp' | 'image/jpeg' | null => {
  const bytes = new Uint8Array(data, 0, Math.min(12, data.byteLength))
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  return null
}

const deleteImages = async (keys: (string | null)[], env: Env) => {
  const toDelete = keys.filter((key): key is string => !!key)
  if (toDelete.length > 0) await env.IMAGES.delete(toDelete)
}

// --- AI card identification ---

// Free-plan Workers AI vision models, tried in order. Llama 4 Scout was fastest (~3s) and
// returned valid JSON every time in testing; Gemma 4 was as accurate but slower and occasionally
// returned unparseable output, so it's the fallback. (GLM 5.3 Flash needs Workers Paid.)
const IDENTIFY_MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/google/gemma-4-26b-a4b-it'] as const
type IdentifyModel = (typeof IDENTIFY_MODELS)[number]
const MAX_IDENTIFY_IMAGES = 2
const MAX_IDENTIFY_IMAGE_CHARS = 4 * 1024 * 1024 // base64 data URL length

const IDENTIFY_PROMPT = `You identify sports trading cards from photos. The photos show the front and/or back of one card, either raw or sealed in a grading slab.

Read printed text exactly as it appears. When a grading label is visible (e.g. a PSA slab's label), it is the most reliable source for year, set, card number, player, grade and cert number, so prefer it over the card itself. Otherwise use the card front and back (the back usually has the card number, set name and copyright year).

"brand" is the full product/set name including the manufacturer, exactly as on the label or card back: e.g. "Panini Donruss Optic", "Topps Chrome", "Upper Deck Young Guns". Never shorten it to just the manufacturer ("Panini", "Topps").

Use null for anything that isn't visible or that you can't determine confidently. Never guess a cert number or card number. "variety" is the parallel/insert/subset name if any (e.g. "Rated Rookie", "Silver Prizm", "Refractor"), else null. "sport" is a single word like Baseball, Basketball, Football, Hockey or Soccer.`

// Strict schema so the response maps straight onto the card form.
const IDENTIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['player', 'year', 'brand', 'cardNumber', 'variety', 'sport', 'isGraded', 'grader', 'grade', 'gradeLabel', 'certNumber'],
  properties: {
    player: { type: ['string', 'null'], description: 'Player or subject name as printed' },
    year: { type: ['string', 'null'], description: 'Card year, e.g. "2018" or "2018-19"' },
    brand: { type: ['string', 'null'], description: 'Full manufacturer + set name, e.g. "Panini Donruss Optic" (never just "Panini")' },
    cardNumber: { type: ['string', 'null'], description: 'Card number without "#"' },
    variety: { type: ['string', 'null'] },
    sport: { type: ['string', 'null'] },
    isGraded: { type: 'boolean', description: 'True if the card is in a grading slab' },
    grader: { type: ['string', 'null'], description: 'Grading company, e.g. "PSA"' },
    grade: { type: ['number', 'null'], description: 'Numeric grade, e.g. 9 or 8.5' },
    gradeLabel: { type: ['string', 'null'], description: 'Grade wording on the label, e.g. "MINT 9"' },
    certNumber: { type: ['string', 'null'], description: 'Cert number from the label, digits only' },
  },
} as const

type IdentifiedCard = {
  player: string | null
  year: string | null
  brand: string | null
  cardNumber: string | null
  variety: string | null
  sport: string | null
  isGraded: boolean
  grader: string | null
  grade: number | null
  gradeLabel: string | null
  certNumber: string | null
}

// Models sometimes drop the number ("MINT" for "MINT 9") or echo the grader ("PSA").
const gradeLabelWithNumber = (label: string | null, grade: unknown): string | null => {
  if (!label || /^(psa|bgs|sgc|cgc)$/i.test(label)) return typeof grade === 'number' ? null : label
  return typeof grade === 'number' && !/\d/.test(label) ? `${label} ${grade}` : label
}

const ALL_CAPS = /^[^a-z]*[A-Z][^a-z]*$/
const titleCase = (value: string) => value.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m) => m.toUpperCase())

// Models are inconsistent about formatting, so tidy the answer before it reaches the form.
const cleanIdentified = (card: IdentifiedCard): IdentifiedCard => {
  const str = (value: unknown, max = 200) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)
  const player = str(card.player)
  const certNumber = str(card.certNumber)?.replace(/\D/g, '') || null
  return {
    // Labels are printed in capitals; keep suffixes like "II" upper-case.
    player: player && ALL_CAPS.test(player) ? titleCase(player).replace(/\b(Ii|Iii|Iv)\b/g, (s) => s.toUpperCase()) : player,
    year: str(card.year, 20),
    brand: str(card.brand),
    cardNumber: str(card.cardNumber, 30)?.replace(/^#\s*/, '') ?? null,
    variety: str(card.variety),
    sport: str(card.sport, 50),
    isGraded: card.isGraded === true,
    grader: str(card.grader, 30),
    grade: typeof card.grade === 'number' && Number.isFinite(card.grade) ? card.grade : null,
    gradeLabel: gradeLabelWithNumber(str(card.gradeLabel, 50), card.grade),
    certNumber: certNumber && certNumber.length >= 5 ? certNumber : null,
  }
}

const runIdentify = async (env: Env, model: IdentifyModel, images: string[]) => {
  // Models differ in their typed inputs; both of these accept OpenAI-style chat messages.
  const run = env.AI.run as (model: string, inputs: Record<string, unknown>) => Promise<unknown>
  const output = await run.call(env.AI, model, {
    messages: [
      { role: 'system', content: IDENTIFY_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Identify this card.' },
          ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'card', schema: IDENTIFY_SCHEMA, strict: true },
    },
    max_completion_tokens: 4096,
  })
  return { card: parseIdentifyOutput(output), usage: (output as { usage?: unknown }).usage ?? null }
}

const parseIdentifyOutput = (output: unknown): IdentifiedCard => {
  // Chat-completions models return choices[].message.content; older ones return { response }.
  const out = output as { choices?: { message?: { content?: unknown } }[]; response?: unknown }
  const content = out.choices?.[0]?.message?.content ?? out.response
  if (content && typeof content === 'object') return cleanIdentified(content as IdentifiedCard)
  if (typeof content !== 'string') throw new HttpError(502, 'The AI returned no answer')
  const json = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  try {
    return cleanIdentified(JSON.parse(json) as IdentifiedCard)
  } catch {
    throw new HttpError(502, 'The AI returned an unreadable answer')
  }
}

// --- Cards ---

type CardFields = Omit<CardRow, 'id' | 'user_id' | 'created_at' | 'updated_at'> & { psa_json: string | null }

const parseCardInput = (body: Record<string, unknown>): CardFields => {
  const list = body.list === 'wishlist' ? 'wishlist' : 'collection'
  const player = text(body.player)
  if (!player) throw new HttpError(400, 'Player / subject is required')
  const certNumber = text(body.certNumber, 20)
  if (certNumber && !/^\d+$/.test(certNumber)) throw new HttpError(400, 'Cert number must be digits only')

  return {
    list,
    is_graded: body.isGraded === false ? 0 : 1,
    cert_number: certNumber,
    grade: num(body.grade),
    grade_label: text(body.gradeLabel, 50),
    sport: text(body.sport, 50),
    year: text(body.year, 20),
    brand: text(body.brand),
    card_number: text(body.cardNumber, 30),
    player,
    variety: text(body.variety),
    population: num(body.population),
    population_higher: num(body.populationHigher),
    notes: text(body.notes, 2000),
    front_image: null,
    back_image: null,
    psa_json: body.psaData ? JSON.stringify(body.psaData).slice(0, 20_000) : null,
  }
}

const readCardInput = async (request: Request, userId: string, env: Env, excludeId: string | null) => {
  const body = await readJson<Record<string, unknown>>(request)
  const fields = parseCardInput(body)
  await assertCertNotDuplicate(fields, userId, env, excludeId)
  fields.front_image = resolveImage(body.frontImage, userId)
  fields.back_image = resolveImage(body.backImage, userId)
  return fields
}

const getOwnCard = async (id: string, userId: string, env: Env): Promise<CardRow> => {
  const card = await env.DB.prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?').bind(id, userId).first<CardRow>()
  if (!card) throw new HttpError(404, 'Card not found')
  return card
}

const assertCertNotDuplicate = async (fields: CardFields, userId: string, env: Env, excludeId: string | null) => {
  if (!fields.cert_number) return
  const existing = await env.DB.prepare(
    'SELECT id FROM cards WHERE user_id = ? AND list = ? AND cert_number = ? AND id IS NOT ?'
  )
    .bind(userId, fields.list, fields.cert_number, excludeId)
    .first()
  if (existing) throw new HttpError(409, `Cert #${fields.cert_number} is already in your ${fields.list}`)
}

// --- Routes ---

type Handler = (ctx: { request: Request; env: Env; url: URL; params: string[]; secure: boolean }) => Promise<Response>

const routes: [method: string, pattern: RegExp, handler: Handler][] = [
  [
    'POST',
    /^\/api\/register$/,
    async ({ request, env, secure }) => {
      const body = await readJson<{ name: string; email: string; password: string; rememberMe: boolean }>(request)
      const name = text(body.name, 80)
      const email = text(body.email, 200)?.toLowerCase()
      const password = typeof body.password === 'string' ? body.password : ''

      if (!name || !email || !password) throw new HttpError(400, 'Name, email and password are required')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address')
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      }

      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
      if (existing) throw new HttpError(409, 'An account with that email already exists')

      const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
      const user: UserRow = {
        id: crypto.randomUUID(),
        email,
        password_hash: await hashPassword(password, salt),
        password_salt: salt,
        name,
        share_collection: 0,
        share_wishlist: 0,
        avatar_image: null,
      }
      await env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, name, created_at) VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(user.id, user.email, user.password_hash, user.password_salt, user.name, new Date().toISOString())
        .run()

      return startSession(user, body.rememberMe, env, secure)
    },
  ],
  [
    'POST',
    /^\/api\/login$/,
    async ({ request, env, secure }) => {
      const body = await readJson<{ email: string; password: string; rememberMe: boolean }>(request)
      const email = text(body.email, 200)?.toLowerCase()
      const password = typeof body.password === 'string' ? body.password : ''
      if (!email || !password) throw new HttpError(400, 'Email and password are required')

      const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>()
      if (!user || (await hashPassword(password, user.password_salt)) !== user.password_hash) {
        throw new HttpError(401, 'Invalid email or password')
      }
      return startSession(user, body.rememberMe, env, secure)
    },
  ],
  [
    'POST',
    /^\/api\/logout$/,
    async ({ secure }) => jsonResponse({ ok: true }, 200, { 'Set-Cookie': buildLogoutCookie(secure) }),
  ],
  [
    'GET',
    /^\/api\/me$/,
    async ({ request, env }) => {
      const userId = await requireUserId(request, env)
      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>()
      if (!user) throw new HttpError(401, 'Not authenticated')
      return jsonResponse({ profile: userToProfile(user) })
    },
  ],
  [
    'PUT',
    /^\/api\/profile$/,
    async ({ request, env }) => {
      const userId = await requireUserId(request, env)
      const body = await readJson<{
        name: string
        shareCollection: boolean
        shareWishlist: boolean
        avatarImage: string | null
      }>(request)
      const name = text(body.name, 80)
      if (!name) throw new HttpError(400, 'Name is required')
      const avatarImage = resolveImage(body.avatarImage, userId)

      const previous = await env.DB.prepare('SELECT avatar_image FROM users WHERE id = ?')
        .bind(userId)
        .first<Pick<UserRow, 'avatar_image'>>()
      await env.DB.prepare(
        'UPDATE users SET name = ?, share_collection = ?, share_wishlist = ?, avatar_image = ? WHERE id = ?'
      )
        .bind(name, body.shareCollection ? 1 : 0, body.shareWishlist ? 1 : 0, avatarImage, userId)
        .run()
      // A replaced or removed avatar isn't referenced anywhere else.
      if (previous?.avatar_image && previous.avatar_image !== avatarImage) {
        await deleteImages([previous.avatar_image], env)
      }
      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>()
      return jsonResponse({ profile: userToProfile(user!) })
    },
  ],
  [
    'GET',
    /^\/api\/cards$/,
    async ({ request, env }) => {
      const userId = await requireUserId(request, env)
      const { results } = await env.DB.prepare('SELECT * FROM cards WHERE user_id = ? ORDER BY created_at DESC')
        .bind(userId)
        .all<CardRow>()
      return jsonResponse({ cards: results.map(rowToCard) })
    },
  ],
  [
    'POST',
    /^\/api\/cards$/,
    async ({ request, env }) => {
      const userId = await requireUserId(request, env)
      const fields = await readCardInput(request, userId, env, null)

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const columns = Object.keys(fields)
      await env.DB.prepare(
        `INSERT INTO cards (id, user_id, ${columns.join(', ')}, created_at, updated_at)
         VALUES (?, ?, ${columns.map(() => '?').join(', ')}, ?, ?)`
      )
        .bind(id, userId, ...Object.values(fields), now, now)
        .run()

      return jsonResponse({ card: rowToCard(await getOwnCard(id, userId, env)) }, 201)
    },
  ],
  [
    'PUT',
    /^\/api\/cards\/([\w-]+)$/,
    async ({ request, env, params: [id] }) => {
      const userId = await requireUserId(request, env)
      const existing = await getOwnCard(id, userId, env)
      const fields = await readCardInput(request, userId, env, id)

      // Edits from the app don't resend PSA data, so keep what the original lookup stored.
      const { psa_json, ...rest } = fields
      const updates: Record<string, unknown> = psa_json ? fields : rest
      const columns = Object.keys(updates)
      await env.DB.prepare(
        `UPDATE cards SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`
      )
        .bind(...Object.values(updates), new Date().toISOString(), id, userId)
        .run()

      await deleteImages(
        [
          existing.front_image !== fields.front_image ? existing.front_image : null,
          existing.back_image !== fields.back_image ? existing.back_image : null,
        ],
        env
      )
      return jsonResponse({ card: rowToCard(await getOwnCard(id, userId, env)) })
    },
  ],
  [
    'DELETE',
    /^\/api\/cards\/([\w-]+)$/,
    async ({ request, env, params: [id] }) => {
      const userId = await requireUserId(request, env)
      const existing = await getOwnCard(id, userId, env)
      await env.DB.prepare('DELETE FROM cards WHERE id = ? AND user_id = ?').bind(id, userId).run()
      await deleteImages([existing.front_image, existing.back_image], env)
      return jsonResponse({ ok: true })
    },
  ],
  [
    'POST',
    /^\/api\/images$/,
    async ({ request, env }) => {
      const userId = await requireUserId(request, env)
      const data = await request.arrayBuffer()
      if (data.byteLength > MAX_IMAGE_BYTES) throw new HttpError(400, 'Image is too large')
      // WebP is what the app produces; JPEG only comes from browsers that can't encode WebP.
      const contentType = sniffImageType(data)
      if (!contentType) throw new HttpError(400, 'Upload must be a WebP or JPEG image')

      const key = newImageKey(userId)
      await env.IMAGES.put(key, data, { httpMetadata: { contentType } })
      return jsonResponse({ key }, 201)
    },
  ],
  [
    'GET',
    /^\/api\/images\/([\w-]+\/[\w-]+)$/,
    async ({ request, env, params: [key] }) => {
      const userId = await requireUserId(request, env)
      const ownerId = key.split('/')[0]
      if (ownerId !== userId) {
        const owner = await env.DB.prepare(
          'SELECT id FROM users WHERE id = ? AND (share_collection = 1 OR share_wishlist = 1)'
        )
          .bind(ownerId)
          .first()
        if (!owner) throw new HttpError(404, 'Image not found')
      }

      const object = await env.IMAGES.get(key)
      if (!object) throw new HttpError(404, 'Image not found')
      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
          // Keys are never reused, so the bytes behind one never change.
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      })
    },
  ],
  [
    'GET',
    /^\/api\/photo-search$/,
    async ({ request, env, url }) => {
      await requireUserId(request, env)
      const query = url.searchParams.get('q')?.trim().slice(0, 200) ?? ''
      if (query.length < 3) throw new HttpError(400, 'Add more card details to search for a photo')
      return jsonResponse({ results: await searchEbayPhotos(env, query) })
    },
  ],
  [
    'GET',
    /^\/api\/remote-image$/,
    async ({ request, env, url }) => {
      // Lets the browser load listing photos same-origin so it can re-encode them as WebP.
      await requireUserId(request, env)
      let target: URL
      try {
        target = new URL(url.searchParams.get('url') ?? '')
      } catch {
        throw new HttpError(400, 'Invalid image URL')
      }
      if (target.protocol !== 'https:' || target.hostname !== EBAY_IMAGE_HOST) throw new HttpError(400, 'Invalid image URL')

      const res = await fetch(target, { headers: OUTBOUND_HEADERS })
      const contentType = res.headers.get('Content-Type') ?? ''
      if (!res.ok || !contentType.startsWith('image/')) throw new HttpError(502, "Couldn't download that photo")
      return new Response(res.body, { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600' } })
    },
  ],
  [
    'POST',
    /^\/api\/identify$/,
    async ({ request, env }) => {
      await requireUserId(request, env)
      const { images, model: requestedModel } = await readJson<{ images?: unknown; model?: unknown }>(request)
      // A specific model can be requested (for comparing them); otherwise try each in order.
      const requested = IDENTIFY_MODELS.find((m) => m === requestedModel)
      const models = requested ? [requested] : IDENTIFY_MODELS
      const valid =
        Array.isArray(images) &&
        images.length > 0 &&
        images.length <= MAX_IDENTIFY_IMAGES &&
        images.every((img) => typeof img === 'string' && /^data:image\/(webp|jpeg|png);base64,/.test(img) && img.length <= MAX_IDENTIFY_IMAGE_CHARS)
      if (!valid) throw new HttpError(400, `Send 1-${MAX_IDENTIFY_IMAGES} photos`)

      const started = Date.now()
      let lastError: unknown
      for (const model of models) {
        try {
          const { card, usage } = await runIdentify(env, model, images as string[])
          return jsonResponse({ card, model, ms: Date.now() - started, usage })
        } catch (error) {
          console.error(`identify with ${model} failed`, error)
          lastError = error
        }
      }
      if (lastError instanceof HttpError) throw lastError
      throw new HttpError(502, "Couldn't identify the card. Try a clearer photo or enter it manually.")
    },
  ],
  [
    'GET',
    /^\/api\/users\/search$/,
    async ({ request, env, url }) => {
      const userId = await requireUserId(request, env)
      const query = url.searchParams.get('q')?.trim().toLowerCase() ?? ''
      if (query.length < 2) return jsonResponse({ users: [] })

      // Names match partially; emails only match exactly so addresses can't be fished for.
      const { results } = await env.DB.prepare(
        `SELECT * FROM users
         WHERE id != ? AND (share_collection = 1 OR share_wishlist = 1)
           AND (LOWER(name) LIKE ? ESCAPE '\\' OR email = ?)
         ORDER BY name LIMIT 20`
      )
        .bind(userId, `%${query.replace(/[\\%_]/g, '\\$&')}%`, query)
        .all<UserRow>()

      return jsonResponse({
        users: results.map((user) => ({
          id: user.id,
          name: user.name,
          sharesCollection: user.share_collection === 1,
          sharesWishlist: user.share_wishlist === 1,
        })),
      })
    },
  ],
  [
    'GET',
    /^\/api\/users\/([\w-]+)\/shared$/,
    async ({ request, env, params: [ownerId] }) => {
      await requireUserId(request, env)
      const owner = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(ownerId).first<UserRow>()
      const lists = [
        owner?.share_collection === 1 && 'collection',
        owner?.share_wishlist === 1 && 'wishlist',
      ].filter((list): list is CardList => !!list)
      if (!owner || lists.length === 0) throw new HttpError(404, 'Nothing shared by this user')

      const { results } = await env.DB.prepare(
        `SELECT * FROM cards WHERE user_id = ? AND list IN (${lists.map(() => '?').join(', ')}) ORDER BY created_at DESC`
      )
        .bind(ownerId, ...lists)
        .all<CardRow>()

      return jsonResponse({
        user: {
          id: owner.id,
          name: owner.name,
          sharesCollection: owner.share_collection === 1,
          sharesWishlist: owner.share_wishlist === 1,
        },
        cards: results.map(rowToCard),
      })
    },
  ],
]

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    const secure = url.protocol === 'https:'
    try {
      for (const [method, pattern, handler] of routes) {
        const match = url.pathname.match(pattern)
        if (match && request.method === method) {
          return await handler({ request, env, url, params: match.slice(1), secure })
        }
      }
      return jsonResponse({ error: 'Not found' }, 404)
    } catch (error) {
      if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status)
      console.error(error)
      return jsonResponse({ error: 'Something went wrong' }, 500)
    }
  },
}
