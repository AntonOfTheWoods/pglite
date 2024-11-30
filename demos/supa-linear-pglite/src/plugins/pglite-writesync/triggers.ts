import {
  backup,
  deleted,
  isNew,
  modifiedColumns,
  sentToServer,
  synced,
} from './migrations'

export const triggerFunctions = `

-- During sync the electric.syncing config var is set to true
-- We can use this in triggers to determine the action that should be performed

-- # Delete triggers:
-- - During sync we delete rows
-- - Otherwise we set the deleted flag to true
CREATE OR REPLACE FUNCTION handle_delete()
RETURNS TRIGGER AS $$
DECLARE
    is_syncing BOOLEAN;
    bypass_triggers BOOLEAN;
BEGIN
    -- Check if electric.syncing is true - defaults to false if not set
    SELECT COALESCE(NULLIF(current_setting('electric.syncing', true), ''), 'false')::boolean INTO is_syncing;
    -- Check if electric.bypass_triggers is true - defaults to false if not set
    SELECT COALESCE(NULLIF(current_setting('electric.bypass_triggers', true), ''), 'false')::boolean INTO bypass_triggers;

    IF bypass_triggers THEN
        RETURN OLD;
    END IF;

    IF is_syncing THEN
        -- If syncing we delete the row
        RETURN OLD;
    ELSE
        -- For local deletions, check if the row is new
        IF OLD.new THEN
            -- If the row is new, just delete it
            RETURN OLD;
        ELSE
            -- Otherwise, set the deleted flag instead of actually deleting
            EXECUTE format('UPDATE %I SET deleted = true WHERE id = $1', TG_TABLE_NAME) USING OLD.id;
            RETURN NULL;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- # Insert triggers:
-- - During sync we insert rows and set modified_columns = []
-- - Otherwise we insert rows and set modified_columns to contain the names of all
--   columns that are not local-state related

CREATE OR REPLACE FUNCTION handle_insert()
RETURNS TRIGGER AS $$
DECLARE
    is_syncing BOOLEAN;
    bypass_triggers BOOLEAN;
    modified_columns TEXT[] := ARRAY[]::TEXT[];
    col_name TEXT;
    new_value TEXT;
    old_value TEXT;
BEGIN
    -- Check if electric.syncing is true - defaults to false if not set
    SELECT COALESCE(NULLIF(current_setting('electric.syncing', true), ''), 'false')::boolean INTO is_syncing;
    -- Check if electric.bypass_triggers is true - defaults to false if not set
    SELECT COALESCE(NULLIF(current_setting('electric.bypass_triggers', true), ''), 'false')::boolean INTO bypass_triggers;

    IF bypass_triggers THEN
        RETURN NEW;
    END IF;

    IF is_syncing THEN
        -- If syncing, we set modified_columns to an empty array
        NEW.${modifiedColumns} := ARRAY[]::TEXT[];
        NEW.${isNew} := FALSE;
        NEW.${sentToServer} := FALSE;
        -- If the row already exists in the database, handle it as an update
        EXECUTE format('SELECT 1 FROM %I WHERE id = $1', TG_TABLE_NAME) USING NEW.id INTO old_value;
        IF old_value IS NOT NULL THEN
            -- Apply update logic similar to handle_update function
            FOR col_name IN SELECT column_name
                               FROM information_schema.columns
                               WHERE table_name = TG_TABLE_NAME AND
                                     column_name NOT IN ('id', '${synced}', '${modifiedColumns}', '${backup}',
                                     '${deleted}', '${isNew}', '${sentToServer}') LOOP
                EXECUTE format('SELECT $1.%I', col_name) USING NEW INTO new_value;
                EXECUTE format('SELECT %I FROM %I WHERE id = $1', col_name, TG_TABLE_NAME) USING NEW.id INTO old_value;
                IF new_value IS DISTINCT FROM old_value THEN
                    EXECUTE format('UPDATE %I SET %I = $1 WHERE id = $2', TG_TABLE_NAME, col_name) USING new_value, NEW.id;
                END IF;
            END LOOP;
            -- Update modified_columns
            EXECUTE format('UPDATE %I SET ${modifiedColumns} = $1 WHERE id = $2', TG_TABLE_NAME)
            USING ARRAY[]::TEXT[], NEW.id;
            -- Update new flag
            EXECUTE format('UPDATE %I SET new = $1 WHERE id = $2', TG_TABLE_NAME)
            USING FALSE, NEW.id;
            -- Update sent_to_server flag
            EXECUTE format('UPDATE %I SET ${sentToServer} = $1 WHERE id = $2', TG_TABLE_NAME)
            USING FALSE, NEW.id;
            RETURN NULL; -- Prevent insertion of a new row
        END IF;
    ELSE
        -- For local inserts, we add all non-local-state columns to modified_columns
        SELECT array_agg(column_name) INTO modified_columns
        FROM information_schema.columns
        WHERE table_name = TG_TABLE_NAME
        AND column_name NOT IN ('id', '${synced}', '${modifiedColumns}', '${backup}', '${deleted}', '${isNew}', '${sentToServer}');
        NEW.${modifiedColumns} := ${modifiedColumns};
        NEW.${isNew} := TRUE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- # Update triggers:
-- - During sync:
--   - If the new modified timestamp is >= the one in the database, we apply the update,
--     set modified_columns = [], and set backup = NULL
--   - Otherwise we apply the update to columns that are NOT in modified_columns and
--   - and save the values for the non-updated columns in the backup JSONB column
-- - During a non-sync transaction:
--   - If we write over a column (that are not local-state related) that was not
--     already modified, we add that column name to modified_columns, and copy the
--     current value from the column to the backup JSONB column
--   - Otherwise we just update the column

CREATE OR REPLACE FUNCTION handle_update()
RETURNS TRIGGER AS $$
DECLARE
    is_syncing BOOLEAN;
    bypass_triggers BOOLEAN;
    column_name TEXT;
    old_value TEXT;
    new_value TEXT;
BEGIN
    -- Check if electric.syncing is true - defaults to false if not set
    SELECT COALESCE(NULLIF(current_setting('electric.syncing', true), ''), 'false')::boolean INTO is_syncing;
    -- Check if electric.bypass_triggers is true - defaults to false if not set
    SELECT COALESCE(NULLIF(current_setting('electric.bypass_triggers', true), ''), 'false')::boolean INTO bypass_triggers;

    IF bypass_triggers THEN
        RETURN NEW;
    END IF;

    IF is_syncing THEN
        -- During sync
        IF (OLD.synced = TRUE) OR (OLD.sent_to_server = TRUE AND NEW.modified >= OLD.modified) THEN
            -- Apply the update, reset modified_columns, backup, new, and sent_to_server flags
            NEW.${modifiedColumns} := ARRAY[]::TEXT[];
            NEW.${backup} := NULL;
            NEW.${isNew} := FALSE;
            NEW.${sentToServer} := FALSE;
        ELSE
            -- Apply update only to columns not in modified_columns
            FOR column_name IN SELECT columns.column_name
                               FROM information_schema.columns
                               WHERE columns.table_name = TG_TABLE_NAME
                               AND columns.column_name NOT IN ('id', '${synced}', '${modifiedColumns}', '${backup}',
                                '${deleted}', '${isNew}', '${sentToServer}') LOOP
                IF column_name != ANY(OLD.${modifiedColumns}) THEN
                    EXECUTE format('SELECT ($1).%I', column_name) USING NEW INTO new_value;
                    EXECUTE format('SELECT ($1).%I', column_name) USING OLD INTO old_value;
                    IF new_value IS DISTINCT FROM old_value THEN
                        EXECUTE format('UPDATE %I SET %I = $1 WHERE id = $2', TG_TABLE_NAME, column_name) USING new_value, NEW.id;
                        NEW.${backup} := jsonb_set(COALESCE(NEW.${backup}, '{}'::jsonb), ARRAY[column_name], to_jsonb(old_value));
                    END IF;
                END IF;
            END LOOP;
            NEW.new := FALSE;
        END IF;
    ELSE
        -- During non-sync transaction
        FOR column_name IN SELECT columns.column_name
                           FROM information_schema.columns
                           WHERE columns.table_name = TG_TABLE_NAME
                           AND columns.column_name NOT IN ('id', '${synced}', '${modifiedColumns}', '${backup}',
                            '${deleted}', '${isNew}', '${sentToServer}') LOOP
            EXECUTE format('SELECT ($1).%I', column_name) USING NEW INTO new_value;
            EXECUTE format('SELECT ($1).%I', column_name) USING OLD INTO old_value;
            IF new_value IS DISTINCT FROM old_value THEN
                IF NOT (column_name = ANY(OLD.${modifiedColumns})) THEN
                    NEW.${modifiedColumns} := array_append(NEW.${modifiedColumns}, column_name);
                    NEW.${backup} := jsonb_set(COALESCE(NEW.${backup}, '{}'::jsonb), ARRAY[column_name], to_jsonb(old_value));
                END IF;
            END IF;
        END LOOP;
        NEW.sent_to_server := FALSE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- # Functions to revert local changes using the backup column

CREATE OR REPLACE FUNCTION revert_local_changes(table_name TEXT, row_id UUID)
RETURNS VOID AS $$
DECLARE
    backup_data JSONB;
    column_name TEXT;
    column_value JSONB;
BEGIN
    EXECUTE format('SELECT ${backup} FROM %I WHERE id = $1', table_name)
    INTO backup_data
    USING row_id;

    IF backup_data IS NOT NULL THEN
        FOR column_name, column_value IN SELECT * FROM jsonb_each(backup_data)
        LOOP
            EXECUTE format('UPDATE %I SET %I = $1, ${modifiedColumns} = array_remove(${modifiedColumns}, $2)
                WHERE id = $3', table_name, column_name)
            USING column_value, column_name, row_id;
        END LOOP;

        -- Clear the backup after reverting
        EXECUTE format('UPDATE %I SET ${backup} = NULL WHERE id = $1', table_name)
        USING row_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Example usage:
-- SELECT revert_local_changes('issue', '123e4567-e89b-12d3-a456-426614174000');
-- SELECT revert_local_changes('comment', '123e4567-e89b-12d3-a456-426614174001');

`
