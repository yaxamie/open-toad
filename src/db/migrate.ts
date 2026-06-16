const url = process.env.DATABASE_URL ?? 'sqlite://./opentoad.db'

if (url.startsWith('postgres')) {
  const { default: postgres } = await import('postgres')
  const sql = postgres(url)

  await sql`
    CREATE TABLE IF NOT EXISTS pads (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at  BIGINT NOT NULL
    )`

  await sql`
    CREATE TABLE IF NOT EXISTS toads (
      id           TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at   BIGINT NOT NULL
    )`

  await sql`
    CREATE TABLE IF NOT EXISTS croaks (
      id         TEXT PRIMARY KEY,
      pad_id     TEXT NOT NULL REFERENCES pads(id),
      toad_id    TEXT NOT NULL REFERENCES toads(id),
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )`

  await sql`
    CREATE TABLE IF NOT EXISTS ribbits (
      id         TEXT PRIMARY KEY,
      croak_id   TEXT NOT NULL REFERENCES croaks(id),
      toad_id    TEXT NOT NULL REFERENCES toads(id),
      body       TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )`

  await sql`
    CREATE TABLE IF NOT EXISTS trusted_ponds (
      id         TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      added_at   BIGINT NOT NULL
    )`

  await sql`ALTER TABLE trusted_ponds ADD COLUMN IF NOT EXISTS access_token TEXT`

  await sql`
    CREATE TABLE IF NOT EXISTS memberships (
      toad_id    TEXT NOT NULL REFERENCES toads(id),
      pad_id     TEXT NOT NULL REFERENCES pads(id),
      created_at BIGINT NOT NULL,
      PRIMARY KEY (toad_id, pad_id)
    )`

  await sql`
    CREATE TABLE IF NOT EXISTS inbox (
      id         TEXT PRIMARY KEY,
      toad_id    TEXT NOT NULL REFERENCES toads(id),
      type       TEXT NOT NULL,
      ref_id     TEXT NOT NULL,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    )`

  await sql.end()
  console.log('Postgres database migrated.')
} else {
  const { default: Database } = await import('better-sqlite3')
  const sqlite = new Database(url.replace('sqlite://', ''))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const runSafe = (sql: string) => { try { sqlite.exec(sql) } catch {} }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pads (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS toads (
      id           TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS croaks (
      id         TEXT PRIMARY KEY,
      pad_id     TEXT NOT NULL REFERENCES pads(id),
      toad_id    TEXT NOT NULL REFERENCES toads(id),
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ribbits (
      id         TEXT PRIMARY KEY,
      croak_id   TEXT NOT NULL REFERENCES croaks(id),
      toad_id    TEXT NOT NULL REFERENCES toads(id),
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trusted_ponds (
      id         TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      added_at   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      toad_id    TEXT NOT NULL REFERENCES toads(id),
      pad_id     TEXT NOT NULL REFERENCES pads(id),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (toad_id, pad_id)
    );
    CREATE TABLE IF NOT EXISTS inbox (
      id         TEXT PRIMARY KEY,
      toad_id    TEXT NOT NULL REFERENCES toads(id),
      type       TEXT NOT NULL,
      ref_id     TEXT NOT NULL,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `)

  runSafe(`ALTER TABLE trusted_ponds ADD COLUMN access_token TEXT`)

  sqlite.close()
  console.log('SQLite database migrated.')
}
