import { PGliteWithLive } from '@electric-sql/pglite/live'
import { triggerFunctions } from './triggers'

const deleted = 'pglite_e77d373e_ba37_4e8b_a659_bdaa603d12d9'
const isNew = 'pglite_cd727928_b776_4fbc_b078_86f6ff510ab2'
const modifiedColumns = 'pglite_577189e4_fc23_48ee_bd44_f7d03168a1c2'
const sentToServer = 'pglite_24ae5c82_38e6_430a_a310_a0adb89237f5'
const synced = 'pglite_d78ceb7d_c1b6_4f11_92b0_0a12657321b1'
const backup = 'pglite_1230f1a9_4944_467f_b5e0_4ac77966a9d3'

export async function addSync(
  pg: PGliteWithLive,
  tables: string[],
  tableSchema: string
) {
  console.log('im doing common trigger funcs')
  await pg.exec(triggerFunctions)
  const syncSetup = `
CREATE OR REPLACE FUNCTION on_create_table_func()
    RETURNS event_trigger AS $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN
        SELECT tab.table_schema, tab.table_name
        FROM information_schema.tables tab
        LEFT JOIN information_schema.columns col ON tab.table_schema = col.table_schema
          AND tab.table_name = col.table_name AND col.column_name = '${deleted}'
        WHERE tab.table_schema = '${tableSchema}'
          AND col.column_name IS NULL
          AND tab.table_name IN ('${tables.join("','")}')
        LOOP
          EXECUTE ''
            'ALTER TABLE ' || quote_ident(r.table_schema) || '.' || quote_ident(r.table_name) || ''
            '  ADD COLUMN IF NOT EXISTS "${deleted}" BOOLEAN NOT NULL DEFAULT FALSE,'
            '  ADD COLUMN IF NOT EXISTS "${isNew}" BOOLEAN NOT NULL DEFAULT FALSE,'
            '  ADD COLUMN IF NOT EXISTS "${modifiedColumns}" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],'
            '  ADD COLUMN IF NOT EXISTS "${sentToServer}" BOOLEAN NOT NULL DEFAULT FALSE,'
            '  ADD COLUMN IF NOT EXISTS "${synced}" BOOLEAN GENERATED ALWAYS AS (ARRAY_LENGTH(${modifiedColumns}, 1) IS NULL AND NOT ${deleted} AND NOT ${isNew}) STORED,'
            '  ADD COLUMN IF NOT EXISTS "${backup}" JSONB;'
            'CREATE INDEX IF NOT EXISTS "' || r.table_name || '_id_idx" ON "' || quote_ident(r.table_schema) || '"."' || quote_ident(r.table_name) || '" ("id");'
            'CREATE INDEX IF NOT EXISTS "' || r.table_name || '_deleted_idx" ON "' || quote_ident(r.table_schema) || '"."' || quote_ident(r.table_name) || '" ("${deleted}");'
            'CREATE INDEX IF NOT EXISTS "' || r.table_name || '_synced_idx" ON "' || quote_ident(r.table_schema) || '"."' || quote_ident(r.table_name) || '" ("${synced}");'
            'CREATE OR REPLACE TRIGGER ' || r.table_name || '_insert_trigger BEFORE insert ON "' || quote_ident(r.table_schema) || '"."' || quote_ident(r.table_name) || '" FOR EACH ROW EXECUTE FUNCTION handle_insert();'
            'CREATE OR REPLACE TRIGGER ' || r.table_name || '_update_trigger BEFORE update ON "' || quote_ident(r.table_schema) || '"."' || quote_ident(r.table_name) || '" FOR EACH ROW EXECUTE FUNCTION handle_update();'
            'CREATE OR REPLACE TRIGGER ' || r.table_name || '_delete_trigger BEFORE delete ON "' || quote_ident(r.table_schema) || '"."' || quote_ident(r.table_name) || '" FOR EACH ROW EXECUTE FUNCTION handle_delete();'
          ;
      END LOOP;
    END
    $$
    LANGUAGE plpgsql;

    CREATE EVENT TRIGGER on_create_table
    ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE')
    EXECUTE PROCEDURE on_create_table_func(); `

  console.log('doing trigger functions fyj', syncSetup)
  await pg.exec(syncSetup)
  console.log('did me da trigger functions fyj')
}
