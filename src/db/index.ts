import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'

const url = process.env.DATABASE_URL ?? 'sqlite://./opentoad.db'
const path = url.replace('sqlite://', '')

const sqlite = new Database(path)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })
