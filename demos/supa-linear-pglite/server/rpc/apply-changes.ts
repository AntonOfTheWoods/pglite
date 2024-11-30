import {
  serverApplyChanges,
  TransactionCallback,
} from '../../src/plugins/pglite-writesync/server'
import { ChangeSet, changeSetSchema } from '../../src/utils/changes'

async function transaction(executor: TransactionCallback) {
  plv8.transaction(() => {
    executor(plv8)
  })
}

export function applyChanges(content: ChangeSet) {
  const parsedChanges = changeSetSchema.parse(content)
  // const transaction: TransactionCallback = (
  //   executor: Record<string, ExecuteCallback>
  // ) => {
  //   return plv8.subtransaction(() => {
  //     return plv8.execute
  //   })
  // }

  serverApplyChanges(parsedChanges, transaction, 'execute')
  return { data: 'ok' }
}
