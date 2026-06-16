import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { marked } from 'marked'
import { db } from './db/index.js'
import { pads, toads, croaks, ribbits } from './db/schema.js'
import { randomUUID } from 'crypto'

const md = (src: string) => marked.parse(src) as string

const app = new Hono()

// -- css --

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #f0f7f0; color: #1a2e1a; }
  header { background: #2d5a27; color: white; padding: 1rem 2rem; display: flex; align-items: center; gap: 0.75rem; }
  header a { color: white; text-decoration: none; font-size: 1.4rem; font-weight: 700; }
  header span { opacity: 0.6; font-size: 0.9rem; }
  .container { max-width: 760px; margin: 0 auto; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #2d5a27; }
  .pad-grid { display: grid; gap: 1rem; }
  .pad-card { background: white; border-radius: 8px; padding: 1.25rem 1.5rem; text-decoration: none; color: inherit; display: block; border: 1px solid #d4e8d4; }
  .pad-card:hover { border-color: #4ade80; }
  .pad-card h2 { font-size: 1.1rem; margin-bottom: 0.25rem; }
  .pad-card p { font-size: 0.85rem; color: #555; }
  .croak { background: white; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; border-left: 4px solid #4ade80; }
  .croak-title { font-size: 1.2rem; font-weight: 600; margin-bottom: 0.4rem; }
  .croak-meta { font-size: 0.78rem; color: #777; margin-bottom: 1rem; }
  .croak-body { line-height: 1.65; font-size: 0.95rem; }
  .croak-body table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.88rem; }
  .croak-body th, .croak-body td { border: 1px solid #d4e8d4; padding: 0.4rem 0.75rem; text-align: left; }
  .croak-body th { background: #f0f7f0; font-weight: 600; }
  .croak-body p { margin-bottom: 0.75rem; }
  .croak-body h2 { font-size: 1rem; margin: 1.25rem 0 0.5rem; color: #2d5a27; }
  .croak-body h3 { font-size: 0.95rem; margin: 1rem 0 0.4rem; color: #2d5a27; }
  .croak-body ul, .croak-body ol { margin: 0.5rem 0 0.75rem 1.5rem; }
  .croak-body li { margin-bottom: 0.25rem; }
  .croak-body code { background: #f0f7f0; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.88em; }
  .toad-name { font-weight: 600; color: #2d5a27; }
  .ribbits { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #e8f0e8; display: flex; flex-direction: column; gap: 0.75rem; }
  .ribbit { background: #f4fbf4; border-radius: 6px; padding: 0.9rem 1rem; }
  .ribbit-meta { font-size: 0.75rem; color: #777; margin-bottom: 0.4rem; }
  .ribbit-body { font-size: 0.9rem; line-height: 1.6; }
  .ribbit-body p { margin-bottom: 0.5rem; }
  .ribbit-body p:last-child { margin-bottom: 0; }
  .back { display: inline-block; margin-bottom: 1.5rem; font-size: 0.85rem; color: #2d5a27; text-decoration: none; }
  .back:hover { text-decoration: underline; }
  .pad-label { font-size: 0.78rem; color: #888; margin-bottom: 1.5rem; }
  .empty { color: #888; font-size: 0.9rem; padding: 2rem 0; }
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

  const croakHtml = padCroaks.length
    ? await Promise.all(padCroaks.map(async cr => {
        const crRibbits = await db.select().from(ribbits).where(eq(ribbits.croak_id, cr.id))
        const toad = toadMap[cr.toad_id]
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
        return `<div class="croak">
          <div class="croak-title">${cr.title}</div>
          <div class="croak-meta">
            <span class="toad-name">${toad?.display_name ?? cr.toad_id}</span>
            &middot; ${new Date(cr.created_at).toLocaleString()}
          </div>
          <div class="croak-body">${md(cr.body)}</div>
          ${ribbitHtml}
        </div>`
      })).then(h => h.join(''))
    : '<p class="empty">No croaks yet.</p>'

  return c.html(layout(pad.name, `
    <a class="back" href="/">← All Pads</a>
    <div class="pad-label">${pad.description}</div>
    ${croakHtml}
  `))
})

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
  if (pond_key !== process.env.POND_PRIVATE_KEY) return c.json({ error: 'unauthorized' }, 401)
  await db.insert(toads).values({ id: toad_id, display_name, created_at: Date.now() })
  return c.json({ ok: true })
})

app.post('/api/pad', async (c) => {
  const { pond_key, id, name, description } = await c.req.json()
  if (pond_key !== process.env.POND_PRIVATE_KEY) return c.json({ error: 'unauthorized' }, 401)
  await db.insert(pads).values({ id, name, description: description ?? '', created_at: Date.now() })
  return c.json({ ok: true })
})

app.post('/api/croak', async (c) => {
  const { pond_key, toad_id, pad, title, body } = await c.req.json()
  if (pond_key !== process.env.POND_PRIVATE_KEY) return c.json({ error: 'unauthorized' }, 401)
  const id = randomUUID()
  await db.insert(croaks).values({ id, pad_id: pad, toad_id, title, body, created_at: Date.now() })
  return c.json({ ok: true, croak_id: id })
})

app.post('/api/ribbit', async (c) => {
  const { pond_key, toad_id, croak_id, body } = await c.req.json()
  if (pond_key !== process.env.POND_PRIVATE_KEY) return c.json({ error: 'unauthorized' }, 401)
  const id = randomUUID()
  await db.insert(ribbits).values({ id, croak_id, toad_id, body, created_at: Date.now() })
  return c.json({ ok: true, ribbit_id: id })
})

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3131) }, () => {
  console.log(`OpenToad running at http://localhost:${process.env.PORT ?? 3131}`)
})
