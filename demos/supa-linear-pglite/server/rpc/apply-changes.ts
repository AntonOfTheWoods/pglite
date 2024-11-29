import {
  ChangeSet,
  changeSetSchema,
  ServerChangeable,
} from '../../src/utils/changes'

export function applyChanges(content: ChangeSet) {
  const parsedChanges = changeSetSchema.parse(content)
  plv8.subtransaction(() => {
    for (const [table, changes] of Object.entries(parsedChanges)) {
      for (const change of changes) {
        applyTableChange(table, change)
      }
    }
  })

  return { data: 'ok' }
}

/**
 * Apply a change to the specified table in the database.
 * @param tableName The name of the table to apply the change to
 * @param change The change object containing the data to be applied
 */
function applyTableChange(tableName: string, change: ServerChangeable): void {
  const { id, modified_columns, new: isNew, deleted } = change

  if (deleted) {
    plv8.execute(
      `
        DELETE FROM ${tableName} WHERE id = $1
      `,
      [id]
    )
  } else if (isNew) {
    const columns = modified_columns || []
    const values = columns.map((col) => change[col])
    plv8.execute(
      `
        INSERT INTO ${tableName} (id, ${columns.join(', ')})
        VALUES ($1, ${columns.map((_, index) => `$${index + 2}`).join(', ')})
      `,
      [id, ...values]
    )
  } else {
    const columns = modified_columns || []
    const values = columns.map((col) => change[col])
    const updateSet = columns
      .map((col, index) => `${col} = $${index + 2}`)
      .join(', ')
    plv8.execute(
      `
        UPDATE ${tableName} SET ${updateSet} WHERE id = $1
      `,
      [id, ...values]
    )
  }
}
