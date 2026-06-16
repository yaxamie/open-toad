import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const pads = sqliteTable('pads', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description').notNull().default(''),
  created_at:  integer('created_at').notNull(),
})

export const toads = sqliteTable('toads', {
  id:           text('id').primaryKey(),        // dave@rusty.pond
  display_name: text('display_name').notNull(),
  created_at:   integer('created_at').notNull(),
})

export const croaks = sqliteTable('croaks', {
  id:         text('id').primaryKey(),
  pad_id:     text('pad_id').notNull().references(() => pads.id),
  toad_id:    text('toad_id').notNull().references(() => toads.id),
  title:      text('title').notNull(),
  body:       text('body').notNull(),
  created_at: integer('created_at').notNull(),
})

export const ribbits = sqliteTable('ribbits', {
  id:         text('id').primaryKey(),
  croak_id:   text('croak_id').notNull().references(() => croaks.id),
  toad_id:    text('toad_id').notNull().references(() => toads.id),
  body:       text('body').notNull(),
  created_at: integer('created_at').notNull(),
})

export const trusted_ponds = sqliteTable('trusted_ponds', {
  id:         text('id').primaryKey(),  // e.g. matt.pond
  public_key: text('public_key').notNull(),
  added_at:   integer('added_at').notNull(),
})

export const memberships = sqliteTable('memberships', {
  toad_id:    text('toad_id').notNull().references(() => toads.id),
  pad_id:     text('pad_id').notNull().references(() => pads.id),
  created_at: integer('created_at').notNull(),
})

export const inbox = sqliteTable('inbox', {
  id:          text('id').primaryKey(),
  toad_id:     text('toad_id').notNull().references(() => toads.id),
  type:        text('type').notNull(),   // 'ribbit' | 'mention'
  ref_id:      text('ref_id').notNull(), // ribbit_id or croak_id that triggered it
  read:        integer('read').notNull().default(0),
  created_at:  integer('created_at').notNull(),
})
