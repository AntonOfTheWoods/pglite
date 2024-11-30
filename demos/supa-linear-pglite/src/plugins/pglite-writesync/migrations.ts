import type { PGliteInterface } from '@electric-sql/pglite'

export const deleted = 'deleted_e77d373e_ba37_4e8b_a659_bdaa603d12d9'
export const isNew = 'new_cd727928_b776_4fbc_b078_86f6ff510ab2'
export const modifiedColumns =
  'modified_columns_577189e4_fc23_48ee_bd44_f7d03168a1c2'
export const sentToServer =
  'sent_to_server_24ae5c82_38e6_430a_a310_a0adb89237f5'
export const synced = 'synced_d78ceb7d_c1b6_4f11_92b0_0a12657321b1'
export const backup = 'backup_1230f1a9_4944_467f_b5e0_4ac77966a9d3'

export async function addSync(pg: PGliteInterface, tables: string[]) {
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
  await pg.exec(sql)
}
