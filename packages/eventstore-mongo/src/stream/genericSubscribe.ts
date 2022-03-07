import type { Event } from '@eventsource/eventstore/Event'
import { pipe } from 'fp-ts/function'
import { throwIfAborted } from 'ix/aborterror'
import * as IX from 'ix/asynciterable'
import * as IXO from 'ix/asynciterable/operators'
import type { ChangeStream, ChangeStreamDocument, ChangeStreamOptions, Document, Timestamp } from 'mongodb'
import type { StoreCollection, StoreSchema } from '../EventStore'
import { fromReadable } from '../internal/asyncIterable/fromReadable'

type Dependencies<E extends Event> = {
    collection: StoreCollection<E>
    batchSize?: number
}

type ChangeStreamInsertDoc<E extends Event> = ChangeStreamDocument<StoreSchema<E>> & {
    operationType: 'insert'
    fullDocument: StoreSchema<E>
    clusterTime: Timestamp
}

type ChangeStreamEvent<E extends Event> =
    | (ChangeStreamDocument<StoreSchema<E>> & { operationType: 'invalidate' })
    | ChangeStreamInsertDoc<E>

const eventStream = <E extends Event>(cursor: ChangeStream<StoreSchema<E>>): AsyncIterable<ChangeStreamEvent<E>> =>
    fromReadable<ChangeStreamEvent<E>>(cursor.stream())

const watch =
    <E2 extends Event>(pipeline: Document = {}, changeStreamOptions: ChangeStreamOptions = {}) =>
    <E extends E2>(deps: Dependencies<E>): AsyncIterable<ChangeStreamInsertDoc<E>> =>
        pipe(
            IX.defer(signal => {
                throwIfAborted(signal)

                return pipe(
                    deps.collection.watch(
                        [
                            {
                                $match: {
                                    $or: [{ operationType: 'insert', ...pipeline }, { operationType: 'invalidate' }],
                                },
                            },
                        ],
                        {
                            readPreference: 'secondaryPreferred',
                            batchSize: deps.batchSize || 1000,
                            ...changeStreamOptions,
                        }
                    ),
                    eventStream
                )
            }),
            IXO.flatMap(event =>
                event.operationType === 'invalidate'
                    ? // eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-vars
                      watch<E>(pipeline, {
                          startAfter: event._id,
                      })(deps)
                    : IX.of(event)
            )
        )

/**
 * @internal
 *
 * MongoServerError: Resume of change stream was not possible, as the resume point may no longer be in the oplog.
 */
export const genericSubscribe = <E extends Event>(
    pipeline: Document = {},
    changeStreamOptions: ChangeStreamOptions = {}
) => watch<E>(pipeline, changeStreamOptions)
