import type { Json, JsonRecord } from 'fp-ts/Json'

export type DataType = Json
export type MetadataType = JsonRecord & {
    correlationId?: string
    causationId?: string
}

export type Event<
    EventType extends string = string,
    EventData extends DataType = DataType,
    EventMetadata extends MetadataType = MetadataType
> = Readonly<{
    id?: string
    type: EventType
    data: EventData
    metadata: EventMetadata
}>

/**
 * @deprecated
 */
export type PersistedEvent<E extends Event> = E & {
    id: string
}

export type EventOptions<
    EventType extends string = string,
    EventData extends DataType | undefined = DataType,
    EventMetadata extends MetadataType | undefined = MetadataType
> = {
    id?: string
    type: EventType
    data?: EventData
    metadata?: EventMetadata
}

type EventFromOptions<A extends EventOptions> = Event<
    A['type'],
    A['data'] extends DataType ? A['data'] : DataType,
    A['metadata'] extends MetadataType ? A['metadata'] : MetadataType
> extends infer U
    ? U
    : never

export const event = <A extends EventOptions>({ id, type, data, metadata }: Readonly<A>): EventFromOptions<A> => ({
    id,
    type,
    data: (data || {}) as A['data'] extends DataType ? A['data'] : DataType,
    metadata: (metadata || {}) as A['metadata'] extends MetadataType ? A['metadata'] : MetadataType,
})
