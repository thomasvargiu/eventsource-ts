import type { IO } from 'fp-ts/IO'
import type { Json, JsonRecord } from 'fp-ts/Json'
import { v4 as uuid } from 'uuid'

export type DataType = Json
export type MetadataType = JsonRecord & {
    readonly correlationId?: string
    readonly causationId?: string
}

export interface EventType {
    readonly id?: string
    readonly type: string
    readonly data?: DataType
    readonly metadata?: MetadataType
}

export type Event<A extends EventType = EventType> = {
    readonly id: string
    readonly type: A['type']
    readonly data: A['data'] extends DataType ? A['data'] : DataType
    readonly metadata: A['metadata'] extends MetadataType ? A['metadata'] : MetadataType
}

export type EventOf<A extends Event = Event> = {
    readonly id: A['id']
    readonly type: A['type']
    readonly data: A['data'] extends DataType ? A['data'] : DataType
    readonly metadata: A['metadata'] extends MetadataType ? A['metadata'] : MetadataType
}

export const event =
    <A extends EventType>({ id, type, data, metadata }: Readonly<A>): IO<Event<A>> =>
    () =>
        ({
            id: id || uuid(),
            type,
            data: data || {},
            metadata: metadata || {},
        } as Event<A>)

export type EventFromCreator<A extends (...args: any[]) => IO<Event>> = ReturnType<ReturnType<A>>
