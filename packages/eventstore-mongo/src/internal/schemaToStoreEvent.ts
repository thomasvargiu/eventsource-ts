import type { Event } from '@eventsource/eventstore/Event'
import type { MongoEvent, StoreSchema } from '../EventStore'

/**
 * @internal
 */
export const schemaToStoreEvent = <E extends Event>(document: StoreSchema<E>): MongoEvent<E> =>
    ({
        event: {
            id: document.id,
            type: document.type,
            data: document.data,
            metadata: document.metadata,
        },
        stream: document.stream,
        timestamp: Number(document.timestamp),
        revision: BigInt(document.revision.toString()),
        position: document.timestamp.toString(),
    } as MongoEvent<E>)
