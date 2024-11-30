import type { Extension, PGliteInterface } from '@electric-sql/pglite'
import { Mutex } from '@electric-sql/pglite'
import { PGliteWithLive } from '@electric-sql/pglite/live'
import { LocalChangeable } from '../../utils/changes'
import { addSync } from './migrations'

type ChangesetSender = (
  changeset: Record<string, LocalChangeable[]>
) => Promise<boolean>

export interface WriteSyncOptions {
  debug?: boolean
  metadataSchema?: string
  syncTables: string[]
  sender: ChangesetSender
}

const syncMutex = new Mutex()

async function startWritePath(
  pg: PGliteWithLive,
  syncTables: string[],
  sender: ChangesetSender
) {
  // Use a live query to watch for changes to the local tables that need to be synced
  pg.waitReady.then(() => {
    pg.live.query<{
      unsynced: number
    }>(
      `
      select * from information_schema.tables ist where ist.table_name in ('issue', 'comment', 'far1', 'far2', 'profiles')
      `,
      [],
      async (results) => {
        console.log(
          'tooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo',
          results
        )
      }
    )

    pg.live.query<{
      unsynced: number
    }>(
      `
       SELECT count(0) as unsynced FROM (
       ${syncTables.map((table) => `SELECT id FROM ${table} WHERE synced = false`).join(' UNION ')}
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
  })
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
          WHERE synced = false AND sent_to_server = false
        `)
        ).rows
      })
    )
  })
  const changeSet: Record<string, LocalChangeable[]> = {}
  for (const [i, change] of syncTables.entries()) {
    changeSet[change] = changes[i].map(
      ({ synced: _, sent_to_server: _1, ...rest }) => {
        return rest
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
               SET sent_to_server = true
               WHERE id = $1 AND modified = $2
             `,
            [up.id, up.modified]
          )
        }
      })
    )
  })
}

async function createPlugin(pg: PGliteWithLive, options: WriteSyncOptions) {
  const debug = options.debug ?? false
  const metadataSchema = options.metadataSchema ?? 'pglite_writesync'
  console.log(
    'I got a pg and an options waiting for ready',
    pg,
    options,
    debug,
    metadataSchema
  )
  // await pg.waitReady
  // console.log('its ready')
  // await migrate(pg, READWRITE_SYNC_TABLES)
  await addSync(pg, options.syncTables, 'public')

  const namespaceObj = {
    maybeMigrateHere: async () => {
      return 'hithere!'
    },
    startWritePath: () =>
      startWritePath(pg, options.syncTables, options.sender),
  }

  const close = async () => {
    console.log('Running pglite-writeserver close')
    // for (const { stream, aborter } of streams) {
    //   stream.unsubscribeAll()
    //   aborter.abort()
    // }
  }

  const init = async () => {
    console.log('Running pglite-writeserver init')
  }

  return {
    namespaceObj,
    close,
    init,
  }
}

export function localSync(options: WriteSyncOptions) {
  return {
    name: 'Postgres local write sync',
    setup: async (pg: PGliteInterface) => {
      // FIXME: how do I type this???
      const fixme = pg as PGliteWithLive
      const { namespaceObj, close, init } = await createPlugin(fixme, options)
      return {
        namespaceObj,
        close,
        init,
      }
    },
  } satisfies Extension // & { live: LiveNamespace }
}
