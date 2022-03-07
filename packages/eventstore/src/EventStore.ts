import type { TaskEither } from 'fp-ts/TaskEither'
import type { Event, EventOf } from './Event'

// stream status
export const ANY = 'ANY' as const
export const STREAM_EXISTS = 'STREAM_EXISTS' as const
export const NO_STREAM = 'NO_STREAM' as const

// positions
export const START = 'START' as const
export const END = 'END' as const

// directions
export const FORWARDS = 'FORWARDS' as const
export const BACKWARDS = 'BACKWARDS' as const

export type ReadDirection = typeof FORWARDS | typeof BACKWARDS
export type ReadRevision = typeof START | typeof END | bigint
export type ReadPosition = typeof START | typeof END | string
export type ExpectedRevision = typeof ANY | typeof NO_STREAM | bigint
export type AppendExpectedRevision = typeof STREAM_EXISTS | ExpectedRevision
export type CurrentRevision = typeof NO_STREAM | bigint

export type StoreEvent<E extends Event = Event> = {
    event: EventOf<E>
    stream: string
    timestamp: number
    revision: bigint
}

export type StoreAllEvent<E extends Event = Event> = StoreEvent<E> & {
    position: string
}

export type AppendResult = {
    revision: bigint
}
export type ReadOptions = {
    signal?: AbortSignal
}
export type AppendToStreamOptions = {
    stream: string
    expectedRevision?: ExpectedRevision
}
export type ReadFromStreamOptions = ReadOptions & {
    stream: string
    fromRevision?: ReadRevision
    direction?: ReadDirection
    maxCount?: number
}
export type ReadAllOptions = ReadOptions & {
    fromPosition?: ReadPosition
    direction?: ReadDirection
    maxCount?: number
}

export type SubscribeOptions = ReadOptions & {
    stream: string
    fromRevision?: ReadRevision
}
export type SubscribeToAllOptions = ReadOptions & {
    fromPosition?: ReadPosition
}

export type DeleteStreamOptions = {
    stream: string
}

export type EventStore<
    E extends Event = Event,
    SE extends StoreEvent<E> = StoreEvent<E>,
    SAE extends StoreAllEvent<E> = StoreAllEvent<E>
> = {
    readStream: (options: ReadFromStreamOptions) => AsyncIterable<SE>
    readAll: (options?: ReadAllOptions) => AsyncIterable<SAE>
    appendToStream: (
        options: AppendToStreamOptions
    ) => (events: E | ReadonlyArray<E>) => TaskEither<Error, AppendResult>
    deleteStream: (options: DeleteStreamOptions) => TaskEither<Error, void>
}

export type SubscribableEventStore<
    E extends Event = Event,
    SE extends StoreEvent<E> = StoreEvent<E>,
    SAE extends StoreAllEvent<E> = StoreAllEvent<E>
> = EventStore<E, SE, SAE> & {
    subscribe: (options: SubscribeOptions) => AsyncIterable<SE>
    subscribeToAll: (options?: SubscribeToAllOptions) => AsyncIterable<SAE>
}
