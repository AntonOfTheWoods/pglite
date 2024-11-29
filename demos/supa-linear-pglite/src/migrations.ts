import type { PGlite } from '@electric-sql/pglite'
import m2 from '../db/migrations-client/02-sync-triggers.sql?raw'
import m3 from '../db/migrations-client/03-add-local-only-columns.sql?raw'
import m1 from '../db/migrations/01-create_tables.sql?raw'

async function addSync(pg: PGlite, tables: string[]) {
  let sql = tables
    .map(
      (table) => `
        ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS "deleted" BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS "new" BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS "modified_columns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          ADD COLUMN IF NOT EXISTS "sent_to_server" BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS "synced" BOOLEAN GENERATED ALWAYS AS (ARRAY_LENGTH(modified_columns, 1) IS NULL AND NOT deleted AND NOT new) STORED,
          ADD COLUMN IF NOT EXISTS "backup" JSONB;
        CREATE INDEX IF NOT EXISTS "${table}_id_idx" ON "${table}" ("id");
        CREATE INDEX IF NOT EXISTS "${table}_deleted_idx" ON "${table}" ("deleted");
        CREATE INDEX IF NOT EXISTS "${table}_synced_idx" ON "${table}" ("synced")`
    )
    .join(';')
  await pg.exec(sql)
  await pg.exec(m2)
  sql = tables
    .map((table) => {
      return ['delete', 'insert', 'update']
        .map((action) => {
          return `
            CREATE OR REPLACE TRIGGER ${table}_${action}_trigger
            BEFORE ${action} ON ${table}
            FOR EACH ROW
            EXECUTE FUNCTION handle_${action}()
            `
        })
        .join(';')
    })
    .join(';')
  await pg.exec(sql)
  await pg.exec(m3)
}

export async function migrate(pg: PGlite, bidirectionalTables: string[]) {
  await pg.exec(m1)
  await addSync(pg, bidirectionalTables)
}
