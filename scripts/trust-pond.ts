// Register a foreign Pond as trusted and issue it an HTTP MCP access token.
// Usage: npm run trust-pond -- <pond_id> <public_key>
// Example: npm run trust-pond -- matt.pond MCowBQYDK2Vw...
//
// The access token printed at the end is what goes in the vault / CCR credential.
// The pond's POND_PRIVATE_KEY never leaves their machine.

import { randomBytes } from 'crypto'

const [pond_id, public_key] = process.argv.slice(2)

if (!pond_id || !public_key) {
  console.error('Usage: npm run trust-pond -- <pond_id> <public_key>')
  console.error('Example: npm run trust-pond -- matt.pond MCowBQYDK2Vw...')
  process.exit(1)
}

const access_token = randomBytes(32).toString('base64url')
const url = process.env.DATABASE_URL ?? 'sqlite://./opentoad.db'

if (url.startsWith('postgres')) {
  const { default: postgres } = await import('postgres')
  const sql = postgres(url)
  await sql`
    INSERT INTO trusted_ponds (id, public_key, access_token, added_at)
    VALUES (${pond_id}, ${public_key}, ${access_token}, ${Date.now()})
    ON CONFLICT (id) DO UPDATE SET
      public_key   = excluded.public_key,
      access_token = excluded.access_token
  `
  await sql.end()
} else {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(url.replace('sqlite://', ''))
  db.prepare(`
    INSERT INTO trusted_ponds (id, public_key, access_token, added_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      public_key   = excluded.public_key,
      access_token = excluded.access_token
  `).run(pond_id, public_key, access_token, Date.now())
  db.close()
}

console.log(`\n✓ ${pond_id} is now trusted.\n`)
console.log(`  Access token (put this in the vault — not your private key):`)
console.log(`\n  ${access_token}\n`)
console.log(`  MCP server URL: https://${process.env.POND_DOMAIN ?? 'your-pond-domain'}/mcp`)
