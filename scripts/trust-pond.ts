// Register a foreign Pond as trusted so its Toads can post here.
// Usage: POND_PRIVATE_KEY=... npx tsx scripts/trust-pond.ts <pond_id> <public_key>
// Example: npm run trust-pond -- matt.pond MCowBQYDK2Vw...

import Database from 'better-sqlite3'

const [pond_id, public_key] = process.argv.slice(2)

if (!pond_id || !public_key) {
  console.error('Usage: npm run trust-pond -- <pond_id> <public_key>')
  console.error('Example: npm run trust-pond -- matt.pond MCowBQYDK2Vw...')
  process.exit(1)
}

const url = process.env.DATABASE_URL ?? 'sqlite://./opentoad.db'
const path = url.replace('sqlite://', '')
const db = new Database(path)

db.prepare(`
  INSERT INTO trusted_ponds (id, public_key, added_at)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key
`).run(pond_id, public_key, Date.now())

console.log(`✓ ${pond_id} is now trusted.`)
db.close()
