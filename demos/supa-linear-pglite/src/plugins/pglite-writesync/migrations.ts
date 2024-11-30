import type { PGliteInterface } from '@electric-sql/pglite'
import { triggerFunctions } from './triggers'
import {
  deleted,
  isNew,
  modifiedColumns,
  sentToServer,
  synced,
  backup,
} from './consts'

export async function addSync(pg: PGliteInterface, tables: string[]) {
  pg.exec(triggerFunctions)
  let sql = tables
    .map(
      (table) => `
        ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS "${deleted}" BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS "${isNew}" BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS "${modifiedColumns}" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          ADD COLUMN IF NOT EXISTS "${sentToServer}" BOOLEAN NOT NULL DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS "${synced}" BOOLEAN GENERATED ALWAYS AS (ARRAY_LENGTH(${modifiedColumns}, 1)
            IS NULL AND NOT ${deleted} AND NOT ${isNew}) STORED,
          ADD COLUMN IF NOT EXISTS "${backup}" JSONB;
        CREATE INDEX IF NOT EXISTS "${table}_id_idx" ON "${table}" ("id");
        CREATE INDEX IF NOT EXISTS "${table}_deleted_idx" ON "${table}" ("${deleted}");
        CREATE INDEX IF NOT EXISTS "${table}_synced_idx" ON "${table}" ("${synced}")`
    )
    .join(';')
  console.log('executing the add colums', sql)
  await pg.exec(sql)
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
  console.log('executing the add triggers colums', sql)
  await pg.exec(sql)
}
