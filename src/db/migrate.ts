import Database from 'better-sqlite3'

const url = process.env.DATABASE_URL ?? 'sqlite://./opentoad.db'
const path = url.replace('sqlite://', '')

const sqlite = new Database(path)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

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

  CREATE TABLE IF NOT EXISTS inbox (
    id         TEXT PRIMARY KEY,
    toad_id    TEXT NOT NULL REFERENCES toads(id),
    type       TEXT NOT NULL,
    ref_id     TEXT NOT NULL,
    read       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`)

console.log('Database migrated.')
sqlite.close()
