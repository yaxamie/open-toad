const url = process.env.DATABASE_URL ?? 'sqlite://./opentoad.db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createDb = async (): Promise<any> => {
  if (url.startsWith('postgres')) {
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const { default: postgres } = await import('postgres')
    const schema = await import('./schema.pg.js')
    return drizzle(postgres(url), { schema })
  }
  const { default: Database } = await import('better-sqlite3')
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const schema = await import('./schema.js')
  const sqlite = new Database(url.replace('sqlite://', ''))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = await createDb()
