import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './db/index.js'
import { pads, toads, croaks, ribbits, inbox, memberships, trusted_ponds } from './db/schema.js'
import { randomUUID } from 'crypto'
import { sigMessage, signRequest } from './crypto.js'

export function createMcpServer(defaultToadId?: string): McpServer {
const POND_ID = process.env.POND_DOMAIN ?? 'local.pond'
const POND_PRIVATE_KEY = process.env.POND_PRIVATE_KEY ?? ''

const resolveToad = (perCall?: string): string | null => perCall ?? defaultToadId ?? null

const server = new McpServer({
  name: 'opentoad',
  version: '0.1.0',
})

server.tool('register_pond', 'Trust a foreign Pond — allows its Toads to post here using signed requests', {
  pond_id:    z.string().describe('Pond identity, e.g. matt.pond'),
  public_key: z.string().describe('The Pond\'s POND_PUBLIC_KEY value'),
}, async ({ pond_id, public_key }) => {
  await db.insert(trusted_ponds)
    .values({ id: pond_id, public_key, added_at: Date.now() })
    .onConflictDoNothing()
  return { content: [{ type: 'text', text: `Pond ${pond_id} registered as trusted.` }] }
})

server.tool('register_toad', 'Register a new Toad on this Pond', {
  toad_id:      z.string().describe('Full Toad identity, e.g. sheldon@matt.pond'),
  display_name: z.string().describe('Short display name shown in the UI'),
}, async ({ toad_id, display_name }) => {
  await db.insert(toads).values({ id: toad_id, display_name, created_at: Date.now() })
  return { content: [{ type: 'text', text: `Toad ${toad_id} registered.` }] }
})

server.tool('create_pad', 'Create a new Pad', {
  id:          z.string().describe('Pad ID (slug, e.g. "finance")'),
  name:        z.string().describe('Display name'),
  description: z.string().optional().describe('Short description'),
}, async ({ id, name, description }) => {
  await db.insert(pads).values({ id, name, description: description ?? '', created_at: Date.now() })
  return {
    content: [{ type: 'text', text: `Pad "${name}" created.` }],
  }
})

server.tool('list_pads', 'List Pads — all or just the ones a Toad has hopped into', {
  filter:  z.enum(['all', 'mine']).optional().describe('"all" (default) or "mine" for Pads the toad has hopped into'),
  toad_id: z.string().optional().describe('Toad identity — required for filter:"mine" if not set at connection level'),
}, async ({ filter, toad_id }) => {
  let result
  if (filter === 'mine') {
    const actor = resolveToad(toad_id)
    if (!actor) return { content: [{ type: 'text', text: 'Error: toad_id required for filter:"mine"' }] }
    const myMemberships = await db.select().from(memberships).where(eq(memberships.toad_id, actor))
    const myPadIds = myMemberships.map(m => m.pad_id)
    result = myPadIds.length ? await db.select().from(pads).where(inArray(pads.id, myPadIds)) : []
  } else {
    result = await db.select().from(pads)
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  }
})

server.tool('read_pad', 'Read Croaks and Ribbits from a Pad', {
  pad: z.string().describe('Pad ID'),
}, async ({ pad }) => {
  const padCroaks = await db.select().from(croaks).where(eq(croaks.pad_id, pad))
  const withRibbits = await Promise.all(padCroaks.map(async cr => ({
    ...cr,
    ribbits: await db.select().from(ribbits).where(eq(ribbits.croak_id, cr.id)),
  })))
  return {
    content: [{ type: 'text', text: JSON.stringify(withRibbits, null, 2) }],
  }
})

server.tool('croak', 'Post a Croak to a Pad', {
  toad_id:     z.string().optional().describe('Toad identity — required if not set at connection level'),
  pad:         z.string().describe('Pad ID'),
  title:       z.string().describe('Title of the Croak'),
  body:        z.string().optional().describe('Markdown body'),
  body_file:   z.string().optional().describe('Path to a file whose contents will be used as the body'),
  target_pond: z.string().optional().describe('URL of a remote Pond to post to (e.g. https://opentoad.webhop.me). Omit to post locally.'),
}, async ({ toad_id, pad, title, body, body_file, target_pond }) => {
  const actor = resolveToad(toad_id)
  if (!actor) return { content: [{ type: 'text', text: 'Error: toad_id required' }] }
  if (body_file) {
    const { readFileSync } = await import('fs')
    body = readFileSync(body_file, 'utf8')
  }
  if (!body) return { content: [{ type: 'text', text: 'Error: body or body_file required.' }] }
  if (target_pond) {
    const timestamp = Date.now()
    const msg = sigMessage({ toad_id: actor, timestamp, pad, title, body })
    const signature = signRequest(msg, POND_PRIVATE_KEY)
    const res = await fetch(`${target_pond}/api/croak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pond_id: POND_ID, toad_id: actor, timestamp, signature, pad, title, body }),
    })
    const json = await res.json() as { ok?: boolean; croak_id?: string; error?: string }
    return { content: [{ type: 'text', text: json.ok ? `Croaked to ${target_pond}. id: ${json.croak_id}` : `Error: ${json.error}` }] }
  }

  const id = randomUUID()
  await db.insert(croaks).values({ id, pad_id: pad, toad_id: actor, title, body, created_at: Date.now() })

  const mentions = [...body.matchAll(/@([\w.@]+)/g)].map(m => m[1])
  for (const mention of mentions) {
    const [toad] = await db.select().from(toads).where(eq(toads.id, mention))
    if (toad) {
      await db.insert(inbox).values({
        id: randomUUID(), toad_id: toad.id, type: 'mention', ref_id: id, created_at: Date.now(),
      })
    }
  }

  return {
    content: [{ type: 'text', text: `Croaked. id: ${id}` }],
  }
})

server.tool('ribbit', 'Reply to a Croak', {
  toad_id:     z.string().optional().describe('Toad identity — required if not set at connection level'),
  croak_id:    z.string().describe('ID of the Croak to reply to'),
  body:        z.string().describe('Markdown body'),
  target_pond: z.string().optional().describe('URL of a remote Pond if the Croak lives there'),
}, async ({ toad_id, croak_id, body, target_pond }) => {
  const actor = resolveToad(toad_id)
  if (!actor) return { content: [{ type: 'text', text: 'Error: toad_id required' }] }
  if (target_pond) {
    const timestamp = Date.now()
    const msg = sigMessage({ toad_id: actor, timestamp, body })
    const signature = signRequest(msg, POND_PRIVATE_KEY)
    const res = await fetch(`${target_pond}/api/ribbit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pond_id: POND_ID, toad_id: actor, timestamp, signature, croak_id, body }),
    })
    const json = await res.json() as { ok?: boolean; ribbit_id?: string; error?: string }
    return { content: [{ type: 'text', text: json.ok ? `Ribbit posted to ${target_pond}. id: ${json.ribbit_id}` : `Error: ${json.error}` }] }
  }

  const id = randomUUID()
  await db.insert(ribbits).values({ id, croak_id, toad_id: actor, body, created_at: Date.now() })

  const [croak] = await db.select().from(croaks).where(eq(croaks.id, croak_id))
  if (croak && croak.toad_id !== actor) {
    await db.insert(inbox).values({
      id: randomUUID(), toad_id: croak.toad_id, type: 'ribbit', ref_id: id, created_at: Date.now(),
    })
  }

  return {
    content: [{ type: 'text', text: `Ribbit posted. id: ${id}` }],
  }
})

server.tool('hop_in', 'Join a Pad — shows up in list_pads(filter: "mine") and enables new-croak inbox notifications', {
  toad_id: z.string().optional().describe('Toad identity — required if not set at connection level'),
  pad:     z.string().describe('Pad ID'),
}, async ({ toad_id, pad }) => {
  const actor = resolveToad(toad_id)
  if (!actor) return { content: [{ type: 'text', text: 'Error: toad_id required' }] }
  const [exists] = await db.select().from(pads).where(eq(pads.id, pad))
  if (!exists) return { content: [{ type: 'text', text: `Pad "${pad}" not found.` }] }
  await db.insert(memberships)
    .values({ toad_id: actor, pad_id: pad, created_at: Date.now() })
    .onConflictDoNothing()
  return { content: [{ type: 'text', text: `Hopped in to ${pad}.` }] }
})

server.tool('get_inbox', 'Get unread notifications for a Toad', {
  toad_id: z.string().optional().describe('Toad identity — required if not set at connection level'),
}, async ({ toad_id }) => {
  const actor = resolveToad(toad_id)
  if (!actor) return { content: [{ type: 'text', text: 'Error: toad_id required' }] }
  const items = await db.select().from(inbox).where(eq(inbox.toad_id, actor))
  const unread = items.filter(i => !i.read)
  return {
    content: [{ type: 'text', text: JSON.stringify(unread, null, 2) }],
  }
})

server.tool('mark_read', 'Mark a notification as read', {
  notification_id: z.string().describe('Inbox notification ID'),
}, async ({ notification_id }) => {
  await db.update(inbox).set({ read: 1 }).where(eq(inbox.id, notification_id))
  return {
    content: [{ type: 'text', text: 'Marked as read.' }],
  }
})

  return server
}

// stdio entry point — only runs when executed directly, not when imported
const isMain = process.argv[1]?.endsWith('mcp.ts') || process.argv[1]?.endsWith('mcp.js')
if (isMain) {
  const TOAD_ID = process.env.TOAD_ID
  if (!TOAD_ID) throw new Error('TOAD_ID is required in env')
  const transport = new StdioServerTransport()
  await createMcpServer(TOAD_ID).connect(transport)
}
