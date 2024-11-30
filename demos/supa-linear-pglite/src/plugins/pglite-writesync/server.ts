import { deleted, idColumn, isNew, modifiedColumns } from './consts'

type ExecuteCallback = (query: string, params?: unknown[]) => Promise<void>
export type TransactionCallback = (
  executor: Record<string, ExecuteCallback>
) => void
export type TransactionExecutor = (
  callback: TransactionCallback
) => Promise<void>

export type Identifier = string | number

export interface ServerChangeable<
  IdentifierType extends Identifier = Identifier,
> extends Record<string, unknown> {
  [idColumn]?: IdentifierType | null
  [modifiedColumns]?: string[] | null
  [deleted]?: boolean | null
  [isNew]?: boolean | null
}

export async function serverApplyChanges(
  changes: Record<string, ServerChangeable[]>,
  transaction: TransactionExecutor,
  executeName: string
) {
  await transaction((executor) => {
    for (const [table, tableChanges] of Object.entries(changes)) {
      for (const change of tableChanges) {
        applyTableChange(table, change, executor[executeName])
      }
    }
  })
  return { success: true }
}

async function applyTableChange(
  tableName: string,
  change: ServerChangeable,
  execute: ExecuteCallback
): Promise<void> {
  // const { id, modified_columns, new: isNew, deleted } = change
  const {
    [idColumn]: id,
    [modifiedColumns]: modified_columns,
    isNew,
    [deleted]: del,
  } = change
  // const hasId = change[idColumn]
  // const hasModifiedColumns = change[modifiedColumns]
  // const hasIsNew = change[]
  if (del) {
    await execute(
      `
        DELETE FROM ${tableName} WHERE ${idColumn} = $1
      `,
      [id]
    )
  } else if (isNew) {
    const columns = modified_columns || []
    const values = columns.map((col) => change[col])
    await execute(
      `
        INSERT INTO ${tableName} (${idColumn}, ${columns.join(', ')})
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
    await execute(
      `
        UPDATE ${tableName} SET ${updateSet} WHERE ${idColumn} = $1
      `,
      [id, ...values]
    )
  }
}
