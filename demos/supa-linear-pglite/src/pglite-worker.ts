import { FetchError } from '@electric-sql/client'
import { PGlite } from '@electric-sql/pglite'
import { electricSync } from '@electric-sql/pglite-sync'
import { live, type PGliteWithLive } from '@electric-sql/pglite/live'
import { worker } from '@electric-sql/pglite/worker'

import m2 from '../db/migrations-client/02-add-local-only-columns.sql?raw'
import m1 from '../db/migrations/01-create_tables.sql?raw'
import { localSync } from './plugins/pglite-writesync'
import { supabase } from './supabase'
import { READ_SYNC_TABLES, WRITE_SYNC_TABLES } from './utils/changes'
import { DB_NAME, ELECTRIC_URL } from './utils/const'
import { LocalChangeable } from './plugins/pglite-writesync/consts'

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
  await pg.localSync.startWritePath({
    syncTables: WRITE_SYNC_TABLES,
    sender: WRITE_SERVER_URL ? sendToWriteServer : sendToRpc,
  })

  for (const syncTable of READ_SYNC_TABLES) {
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
            console.warn('Got auth error, trying to refresh token', error)
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
    console.debug('No session found, waiting and trying again', ses)
    setTimeout(async () => {
      await initCheck(db)
    }, 2000)
  } else {
    currentToken = Promise.resolve(ses.data.session.access_token)
    if (!syncSetup && (await currentToken)) {
      await setupDbSync(db)
      syncSetup = true
    }
  }
}

worker({
  async init() {
    const pg = await PGlite.create({
      dataDir: `idb://${DB_NAME}`,
      relaxedDurability: true,
      extensions: {
        localSync: localSync(),
        sync: electricSync(),
        live,
      },
    })
    // Initialise the static, user-provided sql
    await pg.exec(m1)
    await pg.localSync.setupSync({
      syncTables: WRITE_SYNC_TABLES,
    })
    await pg.exec(m2)

    if (!syncSetup && (await currentToken)) {
      await setupDbSync(pg)
      syncSetup = true
    } else {
      initCheck(pg)
    }

    return pg
  },
})
