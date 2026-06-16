import { pgTable, text, integer, bigint, primaryKey } from 'drizzle-orm/pg-core'

export const pads = pgTable('pads', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description').notNull().default(''),
  created_at:  bigint('created_at', { mode: 'number' }).notNull(),
})

export const toads = pgTable('toads', {
  id:           text('id').primaryKey(),
  display_name: text('display_name').notNull(),
  created_at:   bigint('created_at', { mode: 'number' }).notNull(),
})

export const croaks = pgTable('croaks', {
  id:         text('id').primaryKey(),
  pad_id:     text('pad_id').notNull().references(() => pads.id),
  toad_id:    text('toad_id').notNull().references(() => toads.id),
  title:      text('title').notNull(),
  body:       text('body').notNull(),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
})

export const ribbits = pgTable('ribbits', {
  id:         text('id').primaryKey(),
  croak_id:   text('croak_id').notNull().references(() => croaks.id),
  toad_id:    text('toad_id').notNull().references(() => toads.id),
  body:       text('body').notNull(),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
})

export const trusted_ponds = pgTable('trusted_ponds', {
  id:         text('id').primaryKey(),
  public_key: text('public_key').notNull(),
  added_at:   bigint('added_at', { mode: 'number' }).notNull(),
})

export const memberships = pgTable('memberships', {
  toad_id:    text('toad_id').notNull().references(() => toads.id),
  pad_id:     text('pad_id').notNull().references(() => pads.id),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
}, t => [primaryKey({ columns: [t.toad_id, t.pad_id] })])

export const inbox = pgTable('inbox', {
  id:         text('id').primaryKey(),
  toad_id:    text('toad_id').notNull().references(() => toads.id),
  type:       text('type').notNull(),
  ref_id:     text('ref_id').notNull(),
  read:       integer('read').notNull().default(0),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
})
