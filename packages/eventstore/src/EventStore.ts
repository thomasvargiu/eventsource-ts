import type { EventData, EventType } from '@eventsource/events/Event'
import * as E from 'fp-ts/Either'
import type { NonEmptyArray } from 'fp-ts/NonEmptyArray'
import type { TaskEither } from 'fp-ts/TaskEither'
import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'
import { defer, from, lastValueFrom, Observable } from 'rxjs'
import * as RXO from 'rxjs/operators'

export type StoreEvent<E extends EventType = EventType> = {
    event: EventData<E>
    streamId: string
    timestamp: number
    revision: bigint
}

export type StoreAllEvent<E extends StoreEvent = StoreEvent> = E & {
    position: string
}

export type AppendResult = {
    revision: bigint
}
export type ReadFromStreamOptions = {
    fromRevision?: bigint
    maxCount?: number
}
export type ReadAllOptions = {
    fromPosition?: StreamPosition
    maxCount?: number
}
export type AppendToStreamOptions = {
    expectedRevision?: bigint
}
export type SubscribeOptions = {
    fromRevision?: bigint
}

export type StreamPosition = 'START' | 'END' | string
export type SubscribeToAllOptions = {
    fromPosition?: StreamPosition
}

export type EventStore<
    E extends EventType = EventType,
    ESE extends StoreEvent<E> = StoreEvent<E>,
    ESAE extends StoreAllEvent<StoreEvent<E>> = StoreAllEvent<ESE>,
    ER extends Error = Error
> = {
    readFromStream: (streamId: string, options?: ReadFromStreamOptions) => Observable<ESE>
    readAll: (options?: ReadAllOptions) => Observable<ESAE>
    appendToStream: (
        streamId: string,
        events: EventData<E> | NonEmptyArray<EventData<E>>,
        options?: AppendToStreamOptions
    ) => TaskEither<ER, AppendResult>
    deleteStream: (streamId: string) => TE.TaskEither<Error, void>
}

export type SubscribableEventStore<
    E extends EventType = EventType,
    ESE extends StoreEvent<E> = StoreEvent<E>,
    ESAE extends StoreAllEvent<StoreEvent<E>> = StoreAllEvent<ESE>,
    ER extends Error = Error
> = EventStore<E, ESE, ESAE, ER> & {
    subscribe: (stream: string, options?: SubscribeOptions) => Observable<ESE>
    subscribeToAll: (options?: SubscribeToAllOptions) => Observable<ESAE>
}

export const toTaskEither = <A>(input: Observable<A>) =>
    pipe(input, RXO.toArray(), o$ => TE.tryCatch(() => lastValueFrom(o$, { defaultValue: [] as A[] }), E.toError))

export const fromTaskEither = <E, A>(taskEither: TE.TaskEither<E, A>) => pipe(defer(() => from(taskEither())))

/*
[events, revision] <- readFromStream('user-1')
aggregate <- replay(aggregato)(events)
events <- decide(aggregate, command)
newRevision <- appendToStream('user-1', events, revision)
*/
