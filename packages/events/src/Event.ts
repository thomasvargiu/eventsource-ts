import type { IO } from 'fp-ts/IO'
import type { Json } from 'fp-ts/Json'
import { v4 as uuid } from 'uuid'

export type DataType = Json
export type MetadataType = Record<string, Json> & {
    correlationId?: string
    causationId?: string
}

export type EventType = {
    /**
     * The event type.
     */
    type: string
    /**
     * The data of the event.
     */
    data: DataType

    metadata?: MetadataType
}

export type EventData<A extends EventType = EventType> = {
    id: string
    type: A['type']
    data: A['data']
    metadata: A['metadata'] extends MetadataType ? A['metadata'] : MetadataType
}

export type EventOptions<E extends EventType> = E & {
    id?: string
}

export const event =
    <A extends EventType>({ id, type, data, metadata }: EventOptions<A>): IO<EventData<A>> =>
    () => ({
        id: id || uuid(),
        type,
        data: data,
        metadata: (metadata || {}) as A['metadata'] extends MetadataType ? A['metadata'] : MetadataType,
    })
