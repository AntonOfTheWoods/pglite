import {
  serverApplyChanges,
  TransactionCallback,
} from '../../src/plugins/pglite-writesync/server'
import { ChangeSet, changeSetSchema } from '../../src/utils/changes'

async function transaction(executor: TransactionCallback) {
  plv8.subtransaction(() => {
    executor(plv8)
  })
}

export function applyChanges(content: ChangeSet) {
  const parsedChanges = changeSetSchema.parse(content)

  serverApplyChanges(parsedChanges, transaction, 'execute')
  return { data: 'ok' }
}
