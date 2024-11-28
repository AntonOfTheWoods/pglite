import {
  ChangeSet,
  changeSetSchema,
  CommentChange,
  IssueChange,
} from '../../src/utils/changes'

export function applyChanges(content: ChangeSet) {
  let parsedChanges: ChangeSet
  try {
    parsedChanges = changeSetSchema.parse(content)
    // Any additional validation of the changes can be done here!
  } catch (error) {
    console.error(error)
    // res.status(400).send('Invalid changes')
    return
  }
  const changeResponse = syncChanges(parsedChanges)
  return changeResponse
}

function syncChanges(changes: ChangeSet): void {
  const { issues, comments } = changes

  try {
    plv8.subtransaction(() => {
      for (const issue of issues) {
        applyTableChange('issue', issue)
      }
      for (const comment of comments) {
        applyTableChange('comment', comment)
      }
    })
  } catch (e) {
    console.error('Argh!', e)
    throw e
  }
}

/**
 * Apply a change to the specified table in the database.
 * @param tableName The name of the table to apply the change to
 * @param change The change object containing the data to be applied
 */
function applyTableChange(
  tableName: 'issue' | 'comment',
  change: IssueChange | CommentChange
): void {
  const { id, modified_columns, new: isNew, deleted } = change

  if (deleted) {
    plv8.execute(
      `
        DELETE FROM ${tableName} WHERE id = $1
        -- ON CONFLICT (id) DO NOTHING
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
        -- ON CONFLICT (id) DO NOTHING
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
        -- ON CONFLICT (id) DO NOTHING
      `,
      [id, ...values]
    )
  }
}
