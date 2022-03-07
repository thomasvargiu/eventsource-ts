import type { Event } from '@eventsource/eventstore/Event'
import { Long } from 'mongodb'
import type { StoreSchema } from '../EventStore'

type Options = {
    stream: string
    revision: bigint
    timestamp: number
}

/**
 * @internal
 */
export const eventToSchema =
    ({ stream, revision, timestamp }: Options) =>
    <E extends Event>(event: E): StoreSchema<E> => ({
        stream,
        id: event.id,
        type: event.type,
        data: event.data,
        metadata: event.metadata,
        timestamp: Long.fromNumber(timestamp),
        revision: Long.fromBigInt(revision, true),
    })
