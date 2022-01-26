import type { EventType } from '@eventsource/events/Event'
import type { MongoEvent, StoreSchema } from '../EventStore'

/**
 * @internal
 */
export const schemaToStoreEvent = <E extends EventType>(document: StoreSchema<E>): MongoEvent<E> => ({
    event: {
        id: document.id,
        type: document.type,
        data: document.data,
        metadata: document.metadata,
    },
    streamId: document.streamId,
    timestamp: Number(document.timestamp),
    revision: BigInt(document.revision.toString()),
    position: document.position,
})
