import { PGliteWithLive } from '@electric-sql/pglite/live'
import { triggers } from './triggers'

async function addSync(pg: PGliteWithLive, tables: string[]) {
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
  console.log('doing alters', sql)
  await pg.exec(sql)
  console.log('doing trigger functions')

  await pg.exec(triggers)

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
  console.log('doing triggers', sql)
  await pg.exec(sql)
}

export async function migrate(pg: PGliteWithLive, writeSynctables: string[]) {
  await addSync(pg, writeSynctables)
}
