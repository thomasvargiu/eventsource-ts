import type { EventType } from '@eventsource/events/Event'
import type { ReadFromStreamOptions } from '@eventsource/eventstore/EventStore'
import { pipe } from 'fp-ts/function'
import { Collection, Filter, Long } from 'mongodb'
import { defer, from } from 'rxjs'
import { map } from 'rxjs/operators'
import type { StoreSchema } from '../EventStore'
import { schemaToStoreEvent } from '../internal/schemaToStoreEvent'

type Dependencies<E extends EventType> = {
    collection: Collection<StoreSchema<E>>
}

export type MongoReadFromStreamOptions = ReadFromStreamOptions & {
    toRevision?: bigint
    batchSize?: number
}

export const readFromStream =
    <E extends EventType>(
        stream: string,
        { fromRevision, toRevision, maxCount, batchSize = 1000 }: MongoReadFromStreamOptions = {}
    ) =>
    ({ collection }: Dependencies<E>) =>
        pipe(
            defer(() =>
                from(
                    collection.find(
                        {
                            $and: [
                                { streamId: stream },
                                ...(fromRevision !== undefined
                                    ? [{ revision: { $gt: Long.fromBigInt(fromRevision) } }]
                                    : []),
                                ...(toRevision !== undefined
                                    ? [{ revision: { $lte: Long.fromBigInt(toRevision) } }]
                                    : []),
                            ],
                        } as Filter<StoreSchema<E>>,
                        {
                            sort: { streamId: 1, revision: 1 },
                            limit: maxCount,
                            allowDiskUse: true,
                            batchSize,
                        }
                    )
                )
            ),
            map(schemaToStoreEvent)
        )
