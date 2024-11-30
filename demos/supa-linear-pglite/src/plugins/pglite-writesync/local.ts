import type { Extension, PGliteInterface } from '@electric-sql/pglite'

export interface WriteSyncOptions {
  debug?: boolean
  metadataSchema?: string
}

async function createPlugin(pg: PGliteInterface, options?: WriteSyncOptions) {
  console.log('I got a pg and an options', pg, options)
  // const debug = options?.debug ?? false
  // const metadataSchema = options?.metadataSchema ?? 'pglite_writesync'
  // const streams: Array<{
  //   stream: ShapeStream
  //   aborter: AbortController
  // }> = []

  // TODO: keeping an in-memory lock per table such that two
  // shapes are not synced into one table - this will be
  // resolved by using reference counting in shadow tables
  // const shapePerTableLock = new Map<string, void>()

  const namespaceObj = {
    // syncShapeToTable: async (options: SyncShapeToTableOptions) => {
    //   if (shapePerTableLock.has(options.table)) {
    //     throw new Error('Already syncing shape for table ' + options.table)
    //   }
    //   shapePerTableLock.set(options.table)
    //   let shapeSubState: ShapeSubscriptionState | null = null
    //   // if shapeKey is provided, ensure persistence of shape subscription
    //   // state is possible and check if it is already persisted
    //   if (options.shapeKey) {
    //     shapeSubState = await getShapeSubscriptionState({
    //       pg,
    //       metadataSchema,
    //       shapeKey: options.shapeKey,
    //     })
    //     if (debug && shapeSubState) {
    //       console.log('resuming from shape state', shapeSubState)
    //     }
    //   }
    //   // If it's a new subscription there is no state to resume from
    //   const isNewSubscription = shapeSubState === null
    //   // If it's a new subscription we can do a `COPY FROM` to insert the initial data
    //   // TODO: in future when we can have multiple shapes on the same table we will need
    //   // to make sure we only do a `COPY FROM` on the first shape on the table as they
    //   // may overlap and so the insert logic will be wrong.
    //   let doCopy = isNewSubscription && options.useCopy
    //   const aborter = new AbortController()
    //   if (options.shape.signal) {
    //     // we new to have our own aborter to be able to abort the stream
    //     // but still accept the signal from the user
    //     options.shape.signal.addEventListener('abort', () => aborter.abort(), {
    //       once: true,
    //     })
    //   }
    //   const stream = new ShapeStream({
    //     ...options.shape,
    //     ...(shapeSubState ?? {}),
    //     signal: aborter.signal,
    //   })
    //   // TODO: this aggregates all messages in memory until an
    //   // up-to-date message is received, which is not viable for
    //   // _very_ large shapes - either we should commit batches to
    //   // a temporary table and copy over the transactional result
    //   // or use a separate connection to hold a long transaction
    //   let messageAggregator: ChangeMessage<any>[] = []
    //   let truncateNeeded = false
    //   stream.subscribe(async (messages) => {
    //     if (debug) console.log('sync messages received', messages)
    //     for (const message of messages) {
    //       // accumulate change messages for committing all at once
    //       if (isChangeMessage(message)) {
    //         messageAggregator.push(message)
    //         continue
    //       }
    //       // perform actual DB operations upon receiving control messages
    //       if (!isControlMessage(message)) continue
    //       switch (message.headers.control) {
    //         // mark table as needing truncation before next batch commit
    //         case 'must-refetch':
    //           if (debug) console.log('refetching shape')
    //           truncateNeeded = true
    //           messageAggregator = []
    //           break
    //         // perform all accumulated changes and store stream state
    //         case 'up-to-date':
    //           await pg.transaction(async (tx) => {
    //             if (debug) console.log('up-to-date, committing all messages')
    //             // Set the syncing flag to true during this transaction so that
    //             // user defined triggers on the table are able to chose how to run
    //             // during a sync
    //             tx.exec(`SET LOCAL ${metadataSchema}.syncing = true;`)
    //             if (truncateNeeded) {
    //               truncateNeeded = false
    //               // TODO: sync into shadow table and reference count
    //               // for now just clear the whole table - will break
    //               // cases with multiple shapes on the same table
    //               await tx.exec(`DELETE FROM ${options.table};`)
    //               if (options.shapeKey) {
    //                 await deleteShapeSubscriptionState({
    //                   pg: tx,
    //                   metadataSchema,
    //                   shapeKey: options.shapeKey,
    //                 })
    //               }
    //             }
    //             if (doCopy) {
    //               // We can do a `COPY FROM` to insert the initial data
    //               // Split messageAggregator into initial inserts and remaining messages
    //               const initialInserts: InsertChangeMessage[] = []
    //               const remainingMessages: ChangeMessage<any>[] = []
    //               let foundNonInsert = false
    //               for (const message of messageAggregator) {
    //                 if (
    //                   !foundNonInsert &&
    //                   message.headers.operation === 'insert'
    //                 ) {
    //                   initialInserts.push(message as InsertChangeMessage)
    //                 } else {
    //                   foundNonInsert = true
    //                   remainingMessages.push(message)
    //                 }
    //               }
    //               if (initialInserts.length > 0) {
    //                 // As `COPY FROM` doesn't trigger a NOTIFY, we pop
    //                 // the last insert message and and add it to the be beginning
    //                 // of the remaining messages to be applied after the `COPY FROM`
    //                 remainingMessages.unshift(initialInserts.pop()!)
    //               }
    //               messageAggregator = remainingMessages
    //               // Do the `COPY FROM` with initial inserts
    //               if (initialInserts.length > 0) {
    //                 applyMessagesToTableWithCopy({
    //                   pg: tx,
    //                   table: options.table,
    //                   schema: options.schema,
    //                   messages: initialInserts as InsertChangeMessage[],
    //                   mapColumns: options.mapColumns,
    //                   primaryKey: options.primaryKey,
    //                   debug,
    //                 })
    //                 // We don't want to do a `COPY FROM` again after that
    //                 doCopy = false
    //               }
    //             }
    //             for (const changeMessage of messageAggregator) {
    //               await applyMessageToTable({
    //                 pg: tx,
    //                 table: options.table,
    //                 schema: options.schema,
    //                 message: changeMessage,
    //                 mapColumns: options.mapColumns,
    //                 primaryKey: options.primaryKey,
    //                 debug,
    //               })
    //             }
    //             if (
    //               options.shapeKey &&
    //               messageAggregator.length > 0 &&
    //               stream.shapeHandle !== undefined
    //             ) {
    //               await updateShapeSubscriptionState({
    //                 pg: tx,
    //                 metadataSchema,
    //                 shapeKey: options.shapeKey,
    //                 shapeId: stream.shapeHandle,
    //                 lastOffset:
    //                   messageAggregator[messageAggregator.length - 1].offset,
    //               })
    //             }
    //           })
    //           messageAggregator = []
    //           break
    //       }
    //     }
    //   })
    //   streams.push({
    //     stream,
    //     aborter,
    //   })
    //   const unsubscribe = () => {
    //     stream.unsubscribeAll()
    //     aborter.abort()
    //     shapePerTableLock.delete(options.table)
    //   }
    //   return {
    //     unsubscribe,
    //     get isUpToDate() {
    //       return stream.isUpToDate
    //     },
    //     get shapeId() {
    //       return stream.shapeHandle
    //     },
    //     subscribe: (cb: () => void, error: (err: Error) => void) => {
    //       return stream.subscribe(() => {
    //         if (stream.isUpToDate) {
    //           cb()
    //         }
    //       }, error)
    //     },
    //   }
    // },
  }

  const close = async () => {
    // for (const { stream, aborter } of streams) {
    //   stream.unsubscribeAll()
    //   aborter.abort()
    // }
  }

  const init = async () => {
    // await migrateShapeMetadataTables({
    //   pg,
    //   metadataSchema,
    // })
  }

  return {
    namespaceObj,
    close,
    init,
  }
}

export function localSync(options?: WriteSyncOptions) {
  return {
    name: 'Postgres local write sync',
    setup: async (pg: PGliteInterface) => {
      const { namespaceObj, close, init } = await createPlugin(pg, options)
      return {
        namespaceObj,
        close,
        init,
      }
    },
  } satisfies Extension
}
