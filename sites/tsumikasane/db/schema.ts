import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const userState = sqliteTable('user_state', {
  userId: text('user_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  snapshotId: text('snapshot_id').notNull(),
  previousSnapshotId: text('previous_snapshot_id'),
  updatedAt: text('updated_at').notNull(),
  lastWriteId: text('last_write_id').notNull(),
});
export const stateChunks = sqliteTable('state_chunks', {
  userId: text('user_id').notNull(),
  snapshotId: text('snapshot_id').notNull(),
  part: integer('part').notNull(),
  body: text('body').notNull(),
}, table => [primaryKey({columns:[table.userId,table.snapshotId,table.part]})]);
