import type { EventData, EventType } from '@eventsource/events/Event'
import { Long } from 'mongodb'
import type { StoreSchema } from '../EventStore'

type Options = {
    streamId: string
    revision: bigint
    timestamp: number
    position: string
}

/**
 * @internal
 */
export const eventToSchema =
    ({ streamId, revision, timestamp, position }: Options) =>
    <E extends EventType>(event: EventData<E>): StoreSchema<E> => ({
        streamId,
        id: event.id,
        type: event.type,
        data: event.data,
        metadata: event.metadata,
        timestamp: Long.fromNumber(timestamp),
        revision: Long.fromBigInt(revision),
        position,
    })
