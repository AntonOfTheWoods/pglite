import { FetchError } from '@electric-sql/client'
import { PGlite } from '@electric-sql/pglite'
import { electricSync } from '@electric-sql/pglite-sync'
import { live, type PGliteWithLive } from '@electric-sql/pglite/live'
import { worker } from '@electric-sql/pglite/worker'

import m2 from '../db/migrations-client/02-add-local-only-columns.sql?raw'
import m1 from '../db/migrations/01-create_tables.sql?raw'
import { localSync } from './plugins/pglite-writesync'
import { supabase } from './supabase'
import {
  type LocalChangeable,
  READ_SYNC_TABLES,
  WRITE_SYNC_TABLES,
} from './utils/changes'
import { DB_NAME, ELECTRIC_URL } from './utils/const'

const WRITE_SERVER_URL = import.meta.env.VITE_WRITE_SERVER_URL
const APPLY_CHANGES_URL = `${WRITE_SERVER_URL}/apply-changes`

async function sendToRpc(changeset: Record<string, LocalChangeable[]>) {
  const response = await supabase.rpc('applychanges', {
    content: changeset,
  })
  if (response.error) {
    console.error(response.error)
    throw new Error('Failed to apply changes')
  }
  return true
}

async function sendToWriteServer(changeset: Record<string, LocalChangeable[]>) {
  const response = await fetch(APPLY_CHANGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Some method that will get a valid token
      // authorization: `Bearer ${await currentToken}`,
    },
    body: JSON.stringify(changeset),
  })
  if (!response.ok) {
    throw new Error('Failed to apply changes')
  }

  return true
}

async function getToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('Supabase error', error)
  }

  return data.session?.access_token
}

let currentToken = getToken()
let syncSetup = false

async function setupDbSync(pg: PGliteWithLive) {
  for (const syncTable of READ_SYNC_TABLES) {
    console.log('doing down sync setup', syncTable)
    await pg.sync.syncShapeToTable({
      shape: {
        url: `${ELECTRIC_URL}`,
        table: syncTable,
        headers: {
          authorization: `Bearer ${await currentToken}`,
        },
        // Add custom URL parameters
        onError: async (error: object) => {
          if (
            error instanceof FetchError &&
            [401, 403].includes(error.status)
          ) {
            console.log('something errors', error)
            const token = (await supabase.auth.refreshSession()).data.session
              ?.access_token
            return {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          }
          // Rethrow errors we can't handle
          throw error
        },
      },
      table: syncTable,
      primaryKey: ['id'],
      shapeKey: `${syncTable}s`,
    })
  }
}
async function initCheck(db: PGliteWithLive) {
  const ses = await supabase.auth.getSession()
  if (!ses.data.session?.user) {
    console.log('no session found, waiting and trying again', ses)
    setTimeout(async () => {
      await initCheck(db)
    }, 2000)
  } else {
    currentToken = Promise.resolve(ses.data.session.access_token)
    console.log('got a token', syncSetup, await currentToken)
    if (!syncSetup && (await currentToken)) {
      await setupDbSync(db)
      syncSetup = true
    }
  }
}

worker({
  async init() {
    const pg = await PGlite.create({
      // debug: 1,
      dataDir: `idb://${DB_NAME}`,
      relaxedDurability: true,
      extensions: {
        localSync: localSync({
          syncTables: WRITE_SYNC_TABLES,
          sender: WRITE_SERVER_URL ? sendToWriteServer : sendToRpc,
        }),
        sync: electricSync(),
        live,
      },
    })
    console.log('before doing m1')
    await pg.exec(m1)
    console.log('after doing m1')
    await pg.exec(m2)
    console.log('after doing m2')

    // // Hack to ensure CREATE TABLE event trigger gets called on any new tables just created
    // const tmpName = crypto.randomUUID().replace('-', '_')
    // await pg.exec(
    //   `CREATE TABLE ${tmpName} ( "id" INT NOT NULL); DROP TABLE ${tmpName};`
    // )

    if (!syncSetup && (await currentToken)) {
      await setupDbSync(pg)
      await pg.localSync.startWritePath()
      syncSetup = true
    } else {
      initCheck(pg)
    }

    return pg
  },
})

// const syncMutex = new Mutex()

// async function startWritePath(pg: PGliteWithLive) {
//   // Use a live query to watch for changes to the local tables that need to be synced
//   pg.live.query<{
//     unsynced: number
//   }>(
//     `
//       SELECT count(0) as unsynced FROM (
//       ${WRITE_SYNC_TABLES.map((table) => `SELECT id FROM ${table} WHERE synced = false`).join(' UNION ')}
//       )
//     `,
//     [],
//     async (results) => {
//       const { unsynced } = results.rows[0]
//       if (unsynced > 0) {
//         await syncMutex.acquire()
//         try {
//           doSyncToServer(pg)
//         } finally {
//           syncMutex.release()
//         }
//       }
//     }
//   )
// }
//
// // Call wrapped in mutex to prevent multiple syncs from happening at the same time
// async function doSyncToServer(pg: PGliteWithLive) {
//   let changes: LocalChangeable[][] = []
//   await pg.transaction(async (tx) => {
//     changes = await Promise.all<LocalChangeable[]>(
//       WRITE_SYNC_TABLES.map(async (table) => {
//         return (
//           await tx.query<LocalChangeable>(`
//           SELECT * FROM ${table}
//           WHERE synced = false AND sent_to_server = false
//         `)
//         ).rows
//       })
//     )
//   })
//   const changeSet: Record<string, LocalChangeable[]> = {}
//   for (const [i, change] of WRITE_SYNC_TABLES.entries()) {
//     changeSet[change] = changes[i].map(
//       ({ synced: _, sent_to_server: _1, ...rest }) => {
//         return rest
//       }
//     )
//   }
//
//   if (WRITE_SERVER_URL) {
//     const response = await fetch(APPLY_CHANGES_URL, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(changeSet),
//     })
//     if (!response.ok) {
//       throw new Error('Failed to apply changes')
//     }
//   } else {
//     const response = await supabase.rpc('applychanges', {
//       content: changeSet,
//     })
//     if (response.error) {
//       console.error(response.error)
//       throw new Error('Failed to apply changes')
//     }
//   }
//
//   await pg.transaction(async (tx) => {
//     // Mark all changes as sent to server, but check that the modified timestamp
//     // has not changed in the meantime
//
//     tx.exec('SET LOCAL electric.bypass_triggers = true')
//     await Promise.all(
//       WRITE_SYNC_TABLES.map(async (table, i) => {
//         for (const up of changes[i] || []) {
//           return await tx.query(
//             `
//                UPDATE ${table}
//                SET sent_to_server = true
//                WHERE id = $1 AND modified = $2
//              `,
//             [up.id, up.modified]
//           )
//         }
//       })
//     )
//   })
// }
