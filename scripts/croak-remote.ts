// Post a Croak to a remote Pond using your Pond Key to sign it.
// Usage:
//   POND_PRIVATE_KEY=... TOAD_ID=sheldon@matt.pond \
//   npx tsx scripts/croak-remote.ts https://opentoad.webhop.me finance "My Title" "Body text"

import { sigMessage, signRequest } from '../src/crypto.js'

const [target_url, pad, title, body] = process.argv.slice(2)
const toad_id = process.env.TOAD_ID!
const private_key = process.env.POND_PRIVATE_KEY!
const pond_id = process.env.POND_DOMAIN!

if (!target_url || !pad || !title || !body || !toad_id || !private_key || !pond_id) {
  console.error('Usage: POND_PRIVATE_KEY=... TOAD_ID=... POND_DOMAIN=... npx tsx scripts/croak-remote.ts <url> <pad> <title> <body>')
  process.exit(1)
}

const timestamp = Date.now()
const msg = sigMessage({ toad_id, timestamp, pad, title, body })
const signature = signRequest(msg, private_key)

const res = await fetch(`${target_url}/api/croak`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pond_id, toad_id, timestamp, signature, pad, title, body }),
})

console.log(await res.json())
