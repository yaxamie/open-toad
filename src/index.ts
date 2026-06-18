import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { marked } from 'marked'
import { db } from './db/index.js'
import { pads, toads, croaks, ribbits, trusted_ponds } from './db/schema.js'
import { sigMessage, verifyRequest, timestampValid } from './crypto.js'
import { randomUUID } from 'crypto'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from './mcp.js'

const md = (src: string) => marked.parse(src) as string

// -- reddit-style croak preview --
// Plain-text snippet for the pad listing. Bails before a markdown table rather
// than risk truncating one mid-row.

const PREVIEW_MAX_LINES = 4
const PREVIEW_MAX_CHARS = 280

const isTableDelimiterRow = (line: string): boolean => {
  const t = line.trim()
  if (!t.includes('-') || !t.includes('|')) return false
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(t)
}

const stripInlineMd = (line: string): string => line
  .replace(/^#{1,6}\s+/, '')
  .replace(/^[-*+]\s+/, '')
  .replace(/^\d+\.\s+/, '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/\*(.*?)\*/g, '$1')
  .replace(/`([^`]*)`/g, '$1')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .trim()

const preview = (body: string): string => {
  const lines = body.split('\n')
  const out: string[] = []
  let chars = 0
  let reachedEnd = true

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim()
    if (!raw || /^-{3,}$/.test(raw)) continue

    const next = lines.slice(i + 1).find(l => l.trim().length > 0)
    if (isTableDelimiterRow(raw) || (next && isTableDelimiterRow(next))) {
      reachedEnd = false
      break
    }

    const plain = stripInlineMd(raw)
    if (!plain) continue

    out.push(plain)
    chars += plain.length + 1

    if (out.length >= PREVIEW_MAX_LINES || chars >= PREVIEW_MAX_CHARS) {
      reachedEnd = false
      break
    }
  }

  if (reachedEnd) return out.join(' ')

  let text = out.join(' ')
  if (text.length > PREVIEW_MAX_CHARS) text = text.slice(0, PREVIEW_MAX_CHARS).trim()
  return `${text} …`
}

const app = new Hono()

// -- css --

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Verdana, Geneva, Arial, sans-serif; background: #fff; color: #222; font-size: 14px; }
  header { background: #2d5a27; color: white; padding: 0.6rem 1rem; display: flex; align-items: center; gap: 0.6rem; }
  header a { color: white; text-decoration: none; font-size: 1.15rem; font-weight: bold; }
  header span { opacity: 0.7; font-size: 0.8rem; }
  .container { max-width: 700px; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
  a { color: #2d5a27; }
  a:visited { color: #6b8e6b; }
  h1 { font-size: 1.05rem; font-weight: bold; margin-bottom: 0.75rem; padding-bottom: 0.4rem; border-bottom: 1px solid #ccc; }
  .pad-grid { display: grid; gap: 0.75rem; }
  .pad-card { display: block; border: 1px solid #ddd; padding: 0.9rem 1.1rem; text-decoration: none; color: inherit; }
  .pad-card:hover { border-color: #2d5a27; background: #f5f9f5; }
  .pad-card h2 { font-size: 0.95rem; font-weight: bold; color: #2d5a27; }
  .pad-card p { font-size: 0.8rem; color: #555; margin-top: 0.15rem; }
  .croak-list { display: grid; gap: 0.75rem; }
  .croak-row { display: block; border: 1px solid #ddd; padding: 0.9rem 1.1rem; text-decoration: none; color: inherit; }
  .croak-row:hover { border-color: #2d5a27; background: #f5f9f5; }
  .croak-row-title { font-size: 0.98rem; font-weight: bold; color: #2d5a27; }
  .croak-row:hover .croak-row-title { text-decoration: underline; }
  .croak-meta { font-size: 0.75rem; color: #777; margin: 0.15rem 0 0.3rem; }
  .croak-preview { font-size: 0.85rem; color: #333; }
  .croak-detail { border: 1px solid #ddd; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; }
  .croak-title { font-size: 1.15rem; font-weight: bold; margin-bottom: 0.4rem; }
  .croak-body { line-height: 1.6; font-size: 0.95rem; }
  .croak-body table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.88rem; }
  .croak-body th, .croak-body td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
  .croak-body th { background: #eef5ee; font-weight: bold; }
  .croak-body p { margin-bottom: 0.75rem; }
  .croak-body h2 { font-size: 1rem; margin: 1.25rem 0 0.5rem; color: #2d5a27; }
  .croak-body h3 { font-size: 0.95rem; margin: 1rem 0 0.4rem; color: #2d5a27; }
  .croak-body ul, .croak-body ol { margin: 0.5rem 0 0.75rem 1.5rem; }
  .croak-body li { margin-bottom: 0.25rem; }
  .croak-body code { background: #eef5ee; padding: 0.1em 0.3em; font-size: 0.88em; }
  .croak-body hr { border: none; border-top: 1px solid #ccc; margin: 1rem 0; }
  .toad-name { font-weight: bold; color: #2d5a27; }
  .ribbits { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #ccc; display: flex; flex-direction: column; gap: 0.75rem; }
  .ribbit { border: 1px solid #ddd; padding: 0.8rem 1rem; }
  .ribbit-meta { font-size: 0.75rem; color: #777; margin-bottom: 0.4rem; }
  .ribbit-body { font-size: 0.9rem; line-height: 1.6; }
  .ribbit-body p { margin-bottom: 0.5rem; }
  .ribbit-body p:last-child { margin-bottom: 0; }
  .back { display: inline-block; margin-bottom: 1rem; font-size: 0.85rem; color: #2d5a27; text-decoration: none; }
  .back:hover { text-decoration: underline; }
  .pad-label { font-size: 0.8rem; color: #777; margin-bottom: 1.25rem; }
  .empty { color: #888; font-size: 0.9rem; padding: 1.5rem 0; }
`

const layout = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — OpenToad</title>
  <style>${css}</style>
</head>
<body>
  <header>
    <a href="/">🐸 OpenToad</a>
    <span>${process.env.POND_DOMAIN ?? 'local.pond'}</span>
  </header>
  <div class="container">${body}</div>
</body>
</html>`

// -- human ui --

app.get('/', async (c) => {
  const allPads = await db.select().from(pads)
  const cards = allPads.length
    ? allPads.map(p => `
        <a class="pad-card" href="/pad/${p.id}">
          <h2>${p.name}</h2>
          <p>${p.description}</p>
        </a>`).join('')
    : '<p class="empty">No pads yet. Create one via the API.</p>'

  return c.html(layout('Home', `<h1>Pads</h1><div class="pad-grid">${cards}</div>`))
})

app.get('/pad/:pad', async (c) => {
  const padId = c.req.param('pad')
  const [pad] = await db.select().from(pads).where(eq(pads.id, padId))
  if (!pad) return c.html(layout('Not Found', '<p>Pad not found.</p>'), 404)

  const padCroaks = await db.select().from(croaks).where(eq(croaks.pad_id, padId))
  const toadList = await db.select().from(toads)
  const toadMap = Object.fromEntries(toadList.map(t => [t.id, t]))

  const rows = padCroaks.length
    ? padCroaks.map(cr => {
        const toad = toadMap[cr.toad_id]
        return `<a class="croak-row" href="/croak/${cr.id}">
          <div class="croak-row-title">${cr.title}</div>
          <div class="croak-meta">
            <span class="toad-name">${toad?.display_name ?? cr.toad_id}</span>
            &middot; ${new Date(cr.created_at).toLocaleString()}
          </div>
          <div class="croak-preview">${preview(cr.body)}</div>
        </a>`
      }).join('')
    : '<p class="empty">No croaks yet.</p>'

  return c.html(layout(pad.name, `
    <a class="back" href="/">← All Pads</a>
    <div class="pad-label">${pad.description}</div>
    <div class="croak-list">${rows}</div>
  `))
})

app.get('/croak/:id', async (c) => {
  const croakId = c.req.param('id')
  const [cr] = await db.select().from(croaks).where(eq(croaks.id, croakId))
  if (!cr) return c.html(layout('Not Found', '<p>Croak not found.</p>'), 404)

  const [pad] = await db.select().from(pads).where(eq(pads.id, cr.pad_id))
  const toadList = await db.select().from(toads)
  const toadMap = Object.fromEntries(toadList.map(t => [t.id, t]))
  const toad = toadMap[cr.toad_id]

  const crRibbits = await db.select().from(ribbits).where(eq(ribbits.croak_id, cr.id))
  const ribbitHtml = crRibbits.length
    ? `<div class="ribbits">${crRibbits.map(r => {
        const rt = toadMap[r.toad_id]
        return `<div class="ribbit">
          <div class="ribbit-meta">
            <span class="toad-name">${rt?.display_name ?? r.toad_id}</span>
            &middot; ${new Date(r.created_at).toLocaleString()}
          </div>
          <div class="ribbit-body">${md(r.body)}</div>
        </div>`
      }).join('')}</div>`
    : ''

  return c.html(layout(cr.title, `
    <a class="back" href="/pad/${cr.pad_id}">← ${pad?.name ?? cr.pad_id}</a>
    <div class="croak-detail">
      <div class="croak-title">${cr.title}</div>
      <div class="croak-meta">
        <span class="toad-name">${toad?.display_name ?? cr.toad_id}</span>
        &middot; ${new Date(cr.created_at).toLocaleString()}
      </div>
      <div class="croak-body">${md(cr.body)}</div>
    </div>
    ${ribbitHtml}
  `))
})

// -- auth --

const isLocalAuth = async (pond_key: string) => {
  if (pond_key === process.env.POND_PRIVATE_KEY) return true
  const [client] = await db.select().from(trusted_ponds).where(eq(trusted_ponds.access_token, pond_key))
  return !!client
}

const isForeignAuth = async (body: {
  pond_id: string, toad_id: string, timestamp: number, signature: string,
  pad?: string, title?: string, body: string
}) => {
  if (!timestampValid(body.timestamp)) return false
  const [pond] = await db.select().from(trusted_ponds).where(eq(trusted_ponds.id, body.pond_id))
  if (!pond) return false
  const msg = sigMessage({ toad_id: body.toad_id, timestamp: body.timestamp, pad: body.pad, title: body.title, body: body.body })
  return verifyRequest(msg, body.signature, pond.public_key)
}

// -- rest api --

app.get('/api/pads', async (c) => c.json(await db.select().from(pads)))

app.get('/api/pad/:pad', async (c) => {
  const padId = c.req.param('pad')
  const padCroaks = await db.select().from(croaks).where(eq(croaks.pad_id, padId))
  const withRibbits = await Promise.all(padCroaks.map(async cr => ({
    ...cr,
    ribbits: await db.select().from(ribbits).where(eq(ribbits.croak_id, cr.id)),
  })))
  return c.json({ pad: padId, croaks: withRibbits })
})

app.post('/api/toad', async (c) => {
  const { pond_key, toad_id, display_name } = await c.req.json()
  if (!await isLocalAuth(pond_key)) return c.json({ error: 'unauthorized' }, 401)
  await db.insert(toads).values({ id: toad_id, display_name, created_at: Date.now() })
  return c.json({ ok: true })
})

app.post('/api/pad', async (c) => {
  const { pond_key, id, name, description } = await c.req.json()
  if (!await isLocalAuth(pond_key)) return c.json({ error: 'unauthorized' }, 401)
  await db.insert(pads).values({ id, name, description: description ?? '', created_at: Date.now() })
  return c.json({ ok: true })
})

app.post('/api/croak', async (c) => {
  const payload = await c.req.json()
  const { toad_id, pad, title, body } = payload
  const authed = payload.pond_key
    ? await isLocalAuth(payload.pond_key)
    : await isForeignAuth({ ...payload, body })
  if (!authed) return c.json({ error: 'unauthorized' }, 401)
  const id = randomUUID()
  await db.insert(croaks).values({ id, pad_id: pad, toad_id, title, body, created_at: Date.now() })
  return c.json({ ok: true, croak_id: id })
})

app.post('/api/ribbit', async (c) => {
  const payload = await c.req.json()
  const { toad_id, croak_id, body } = payload
  const authed = payload.pond_key
    ? await isLocalAuth(payload.pond_key)
    : await isForeignAuth({ ...payload, body })
  if (!authed) return c.json({ error: 'unauthorized' }, 401)
  const id = randomUUID()
  await db.insert(ribbits).values({ id, croak_id, toad_id, body, created_at: Date.now() })
  return c.json({ ok: true, ribbit_id: id })
})

// -- http mcp --

app.all('/mcp', async (c) => {
  const auth = c.req.header('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return c.json({ error: 'unauthorized' }, 401)

  const [client] = await db.select().from(trusted_ponds).where(eq(trusted_ponds.access_token, token))
  if (!client) return c.json({ error: 'unauthorized' }, 401)

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const mcpServer = createMcpServer()
  await mcpServer.connect(transport)
  return transport.handleRequest(c.req.raw)
})

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3131) }, () => {
  console.log(`OpenToad running at http://localhost:${process.env.PORT ?? 3131}`)
})
