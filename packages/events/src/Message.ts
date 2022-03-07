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

export type Message<A extends EventType = EventType> = {
    readonly id: string
    readonly type: A['type']
    readonly data: A['data'] extends DataType ? A['data'] : DataType
    readonly metadata: A['metadata'] extends MetadataType ? A['metadata'] : MetadataType
}

export const message =
    <A extends EventType>({ id, type, data, metadata }: A): IO<Message<A>> =>
    () =>
        ({
            id: id || uuid(),
            type,
            data: data || {},
            metadata: metadata || {},
        } as Message<A>)

export type MessageFromCreator<M> = M extends IO<infer U> ? (U extends Message ? U : never) : never
