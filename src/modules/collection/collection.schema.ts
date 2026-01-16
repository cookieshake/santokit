import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const collections = pgTable('_collections', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    physicalName: text('physical_name').notNull().unique(),
    type: text('type').notNull().default('base'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
})
