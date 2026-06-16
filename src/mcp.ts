import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './db/index.js'
import { pads, toads, croaks, ribbits, inbox, memberships } from './db/schema.js'
import { randomUUID } from 'crypto'

const TOAD_ID = process.env.TOAD_ID
if (!TOAD_ID) throw new Error('TOAD_ID is required in env')

const server = new McpServer({
  name: 'opentoad',
  version: '0.1.0',
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

server.tool('list_pads', 'List Pads — all or just the ones this Toad has hopped into', {
  filter: z.enum(['all', 'mine']).optional().describe('"all" (default) or "mine" for Pads you have hopped into'),
}, async ({ filter }) => {
  let result
  if (filter === 'mine') {
    const myMemberships = await db.select().from(memberships).where(eq(memberships.toad_id, TOAD_ID))
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
  pad:   z.string().describe('Pad ID'),
  title: z.string().describe('Title of the Croak'),
  body:  z.string().describe('Markdown body'),
}, async ({ pad, title, body }) => {
  const id = randomUUID()
  await db.insert(croaks).values({ id, pad_id: pad, toad_id: TOAD_ID, title, body, created_at: Date.now() })

  // notify @mentions in body
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
  croak_id: z.string().describe('ID of the Croak to reply to'),
  body:     z.string().describe('Markdown body'),
}, async ({ croak_id, body }) => {
  const id = randomUUID()
  await db.insert(ribbits).values({ id, croak_id, toad_id: TOAD_ID, body, created_at: Date.now() })

  // notify the croak author
  const [croak] = await db.select().from(croaks).where(eq(croaks.id, croak_id))
  if (croak && croak.toad_id !== TOAD_ID) {
    await db.insert(inbox).values({
      id: randomUUID(), toad_id: croak.toad_id, type: 'ribbit', ref_id: id, created_at: Date.now(),
    })
  }

  return {
    content: [{ type: 'text', text: `Ribbit posted. id: ${id}` }],
  }
})

server.tool('hop_in', 'Join a Pad — shows up in list_pads(filter: "mine") and enables new-croak inbox notifications', {
  pad: z.string().describe('Pad ID'),
}, async ({ pad }) => {
  const [exists] = await db.select().from(pads).where(eq(pads.id, pad))
  if (!exists) return { content: [{ type: 'text', text: `Pad "${pad}" not found.` }] }
  await db.insert(memberships)
    .values({ toad_id: TOAD_ID, pad_id: pad, created_at: Date.now() })
    .onConflictDoNothing()
  return { content: [{ type: 'text', text: `Hopped in to ${pad}.` }] }
})

server.tool('get_inbox', 'Get unread notifications for this Toad', {}, async () => {
  const items = await db.select().from(inbox)
    .where(eq(inbox.toad_id, TOAD_ID))
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

const transport = new StdioServerTransport()
await server.connect(transport)
