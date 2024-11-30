import type { Extension, PGliteInterface } from '@electric-sql/pglite'
import { Mutex } from '@electric-sql/pglite'
import { PGliteWithLive } from '@electric-sql/pglite/live'
import { addSync } from './migrations'
import {
  idColumn,
  LocalChangeable,
  modified,
  sentToServer,
  synced,
} from './consts'

type ChangesetSender = (
  changeset: Record<string, LocalChangeable[]>
) => Promise<boolean>

export interface WriteSyncOptions {
  debug?: boolean
  metadataSchema?: string
}

const syncMutex = new Mutex()

async function startWrite(
  pg: PGliteWithLive,
  syncTables: string[],
  sender: ChangesetSender
) {
  pg.live.query<{
    unsynced: number
  }>(
    `
       SELECT count(0) as unsynced FROM (
       ${syncTables.map((table) => `SELECT id FROM ${table} WHERE ${synced} = false`).join(' UNION ')}
       )
     `,
    [],
    async (results) => {
      const { unsynced } = results.rows[0]
      if (unsynced > 0) {
        await syncMutex.acquire()
        try {
          doSyncToServer(pg, syncTables, sender)
        } finally {
          syncMutex.release()
        }
      }
    }
  )
  // })
}

// Call wrapped in mutex to prevent multiple syncs from happening at the same time
async function doSyncToServer(
  pg: PGliteWithLive,
  syncTables: string[],
  sender: ChangesetSender
) {
  let changes: LocalChangeable[][] = []
  await pg.transaction(async (tx) => {
    changes = await Promise.all<LocalChangeable[]>(
      syncTables.map(async (table) => {
        return (
          await tx.query<LocalChangeable>(`
          SELECT * FROM ${table}
          WHERE ${synced} = false AND ${sentToServer} = false
        `)
        ).rows
      })
    )
  })
  const changeSet: Record<string, LocalChangeable[]> = {}
  for (const [i, change] of syncTables.entries()) {
    changeSet[change] = changes[i].map(
      // ({ synced: _, sent_to_server: _1, ...rest }) => {
      (change) => {
        if (synced in change) delete change[synced]
        if (sentToServer in change) delete change[sentToServer]
        return change
      }
    )
  }

  await sender(changeSet)

  await pg.transaction(async (tx) => {
    // Mark all changes as sent to server, but check that the modified timestamp
    // has not changed in the meantime

    tx.exec('SET LOCAL electric.bypass_triggers = true')
    await Promise.all(
      syncTables.map(async (table, i) => {
        for (const up of changes[i] || []) {
          return await tx.query(
            `
               UPDATE ${table}
               SET ${sentToServer} = true
               WHERE ${idColumn} = $1 AND ${modified} = $2
             `,
            [up.id, up.modified]
          )
        }
      })
    )
  })
}

async function createPlugin(pg: PGliteWithLive) {
  const namespaceObj = {
    setupSync: async ({ syncTables }: { syncTables: string[] }) => {
      await addSync(pg, syncTables)
    },
    startWritePath: async ({
      syncTables,
      sender,
    }: {
      syncTables: string[]
      sender: ChangesetSender
    }) => {
      await startWrite(pg, syncTables, sender)
    },
  }

  const close = async () => {
    // console.debug('Running pglite-writesync close')
  }

  const init = async () => {
    // console.debug('Running pglite-writesync init')
  }

  return {
    namespaceObj,
    close,
    init,
  }
}

export function localSync() {
  return {
    name: 'Postgres local write sync',
    setup: async (pg: PGliteInterface) => {
      // FIXME: how do I type this???
      const fixme = pg as PGliteWithLive
      const { namespaceObj, close, init } = await createPlugin(fixme)
      return {
        namespaceObj,
        close,
        init,
      }
    },
  } satisfies Extension // & { live: LiveNamespace }
}
