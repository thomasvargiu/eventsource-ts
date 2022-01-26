import type { EventType } from '@eventsource/events/Event'
import type { ReadAllOptions, StreamPosition } from '@eventsource/eventstore/EventStore'
import type * as R from 'fp-ts/Reader'
import { pipe } from 'fp-ts/function'
import type { Collection, Filter } from 'mongodb'
import { defer, from, Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import type { MongoEvent, StoreSchema } from '../EventStore'
import { schemaToStoreEvent } from '../internal/schemaToStoreEvent'

type Dependencies<E extends EventType> = {
    collection: Collection<StoreSchema<E>>
}

export type MongoReadAllOptions = ReadAllOptions & {
    toPosition?: string
    batchSize?: number
}

const position = (fromPosition?: StreamPosition) => {
    switch (fromPosition) {
        case 'START':
            return ''
        case 'END':
            return undefined
    }

    return fromPosition
}

export const readAll =
    <E extends EventType>({ maxCount, fromPosition, toPosition }: MongoReadAllOptions = {}): R.Reader<
        Dependencies<E>,
        Observable<MongoEvent<E>>
    > =>
    ({ collection }) =>
        pipe(
            {
                fromPos: position(fromPosition),
                toPos: position(toPosition),
            },
            ({ fromPos, toPos }) =>
                defer(() =>
                    from(
                        collection.find(
                            {
                                ...(fromPos !== undefined || toPos !== undefined
                                    ? {
                                          $and: [
                                              ...(fromPos !== undefined ? [{ position: { $gt: fromPos } }] : []),
                                              ...(toPos !== undefined ? [{ position: { $lte: toPos } }] : []),
                                          ],
                                      }
                                    : {}),
                            } as Filter<StoreSchema<E>>,
                            {
                                sort: { position: 1 },
                                limit: maxCount,
                                allowDiskUse: true,
                                batchSize: 1000,
                            }
                        )
                    )
                ),
            map(schemaToStoreEvent)
        )
