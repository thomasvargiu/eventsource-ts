import type { EventData, EventType } from '@eventsource/events/Event'
import { RevisionMismatchError } from '@eventsource/eventstore'
import type {
    AppendToStreamOptions,
    StoreAllEvent,
    StoreEvent,
    ReadAllOptions,
    ReadFromStreamOptions,
    StreamPosition,
    SubscribableEventStore,
    SubscribeOptions,
    SubscribeToAllOptions,
} from '@eventsource/eventstore/EventStore'
import { array } from 'fp-ts'
import type { NonEmptyArray } from 'fp-ts/NonEmptyArray'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Reader'
import * as TE from 'fp-ts/TaskEither'
import { snd } from 'fp-ts/Tuple'
import { constVoid, identity, pipe } from 'fp-ts/function'
import * as RX from 'rxjs'
import * as RXO from 'rxjs/operators'

type MemoryEvent<E extends EventType> = StoreAllEvent<StoreEvent<E>>
type MemoryAllEvent<E extends EventType> = MemoryEvent<E>

type Store<E extends EventType> = {
    sequence: bigint
    $all: Map<bigint, MemoryAllEvent<E>>
    stream$: RX.Subject<MemoryAllEvent<E>>
    streams: Map<string, StreamStore<E>>
}

type StreamStore<E extends EventType> = Map<bigint, MemoryEvent<E>>

const appendToStream =
    <SE extends EventType, E extends SE>(
        streamId: string,
        events: EventData<E> | NonEmptyArray<EventData<E>>,
        { expectedRevision }: AppendToStreamOptions = {}
    ) =>
    (state: Store<SE>) =>
        pipe(
            TE.Do,
            TE.chain(() => {
                const stream = state.streams.get(streamId) || new Map<bigint, MemoryEvent<E>>()

                let revision = BigInt(stream.size) - BigInt(1)

                if (undefined !== expectedRevision && revision !== expectedRevision) {
                    return TE.left(new RevisionMismatchError(expectedRevision || BigInt(-1), revision))
                }

                const timestamp = Date.now()

                pipe(
                    Array.isArray(events) ? events : ([events] as NonEmptyArray<EventData<E>>),
                    array.map(event => {
                        state.sequence++

                        const newEvent = {
                            event,
                            streamId,
                            revision: ++revision,
                            timestamp,
                            position: state.sequence.toString(),
                        }
                        stream.set(newEvent.revision, newEvent)
                        state.$all.set(state.sequence, newEvent)
                        state.stream$.next(newEvent)
                    })
                )

                if (!state.streams.has(streamId)) {
                    state.streams.set(streamId, stream)
                }

                return TE.of({ revision })
            })
        )

export const readFromStream =
    <E extends EventType>(
        streamId: string,
        { fromRevision, toRevision, maxCount }: ReadFromStreamOptions & { toRevision?: bigint } = {}
    ) =>
    (store: Store<E>): RX.Observable<MemoryEvent<E>> =>
        RX.defer(() =>
            pipe(
                store.streams.get(streamId),
                O.fromNullable,
                O.map(stream =>
                    pipe(
                        RX.from(stream.entries()),
                        RX.map(snd),
                        RXO.filter(
                            event =>
                                event.streamId === streamId &&
                                (fromRevision === undefined || event.revision > fromRevision) &&
                                (toRevision === undefined || event.revision <= toRevision)
                        ),
                        maxCount ? RXO.take(maxCount) : identity
                    )
                ),
                O.getOrElse((): RX.Observable<MemoryEvent<E>> => RX.EMPTY)
            )
        )

export const deleteStream =
    <E extends EventType>(streamId: string) =>
    (store: Store<E>) =>
        pipe(
            TE.Do,
            TE.chain(() =>
                pipe(
                    store.streams.get(streamId),
                    O.fromNullable,
                    O.chainFirst(stream =>
                        pipe(
                            Array.from(stream.entries()),
                            array.chainFirst(([, event]) => {
                                store.$all.delete(BigInt(event.position))
                                return []
                            }),
                            O.some
                        )
                    ),
                    O.chainFirst(() => pipe(store.streams.delete(streamId), O.some)),
                    () => TE.right(constVoid())
                )
            )
        )

const position =
    <E extends EventType>(store: Store<E>) =>
    (pos?: StreamPosition) => {
        switch (pos) {
            case 'START':
                return '0'
            case 'END':
                return store.sequence.toString()
        }

        return pos
    }

export const readAll =
    <E extends EventType>({ fromPosition, toPosition, maxCount }: ReadAllOptions & { toPosition?: string } = {}) =>
    (store: Store<E>): RX.Observable<MemoryAllEvent<E>> =>
        RX.defer(() =>
            pipe(
                {
                    stream: store.$all,
                    from: position(store)(fromPosition),
                    to: position(store)(toPosition),
                },
                ({ stream, from, to }) =>
                    pipe(
                        RX.from(stream.entries()),
                        RX.map(snd),
                        RXO.filter(
                            event =>
                                (from === undefined || event.position > from) &&
                                (to === undefined || event.position <= to)
                        ),
                        maxCount ? RXO.take(maxCount) : identity
                    )
            )
        )

const getStreamRevision =
    <E extends EventType>(streamId: string) =>
    (store: Store<E>) =>
        pipe(
            store.streams.get(streamId),
            O.fromNullable,
            O.map(stream => BigInt(stream.size - 1)),
            O.getOrElse(() => BigInt(-1))
        )

export const subscribe =
    <E extends EventType>(streamId: string, { fromRevision }: SubscribeOptions = {}) =>
    (store: Store<E>): RX.Observable<MemoryEvent<E>> =>
        RX.defer(() =>
            pipe(
                undefined === fromRevision
                    ? pipe(
                          store.stream$,
                          RXO.filter(event => event.streamId === streamId)
                      )
                    : pipe(
                          getStreamRevision<E>(streamId),
                          R.chain(currentRevision =>
                              pipe(
                                  R.Do,
                                  R.chain(() =>
                                      readFromStream<E>(streamId, {
                                          fromRevision: fromRevision,
                                          toRevision: currentRevision,
                                      })
                                  ),
                                  R.map(o$ =>
                                      RX.concat(
                                          o$,
                                          pipe(
                                              store.stream$,
                                              RXO.filter(
                                                  event =>
                                                      event.streamId === streamId && event.revision > currentRevision
                                              )
                                          )
                                      )
                                  )
                              )
                          )
                      )(store)
            )
        )

export const subscribeToAll =
    <E extends EventType>({ fromPosition }: SubscribeToAllOptions = {}) =>
    (store: Store<E>) =>
        RX.defer(() =>
            pipe(
                undefined === fromPosition
                    ? store.stream$
                    : pipe(store.sequence.toString(), toPosition =>
                          RX.concat(
                              pipe(store, readAll({ fromPosition, toPosition })),
                              pipe(
                                  store.stream$,
                                  RXO.filter(event => event.position > toPosition)
                              )
                          )
                      )
            )
        )

export const createStore = <E extends EventType>(): Store<E> => ({
    sequence: BigInt(0),
    $all: new Map<bigint, MemoryAllEvent<E>>(),
    stream$: new RX.Subject<MemoryAllEvent<E>>(),
    streams: new Map<string, StreamStore<E>>(),
})

const reverseReader =
    <A extends readonly unknown[], B, R>(func: (...a: A) => R.Reader<R, B>): R.Reader<R, (...a: A) => B> =>
    (r: R) =>
    (...a: A) =>
        func(...a)(r)

export const create = <E extends EventType>(store?: Store<E>): SubscribableEventStore<E> => {
    const eventStore = store || createStore<E>()

    return {
        appendToStream: reverseReader(appendToStream)(eventStore),
        readFromStream: reverseReader(readFromStream)(eventStore),
        deleteStream: reverseReader(deleteStream)(eventStore),
        subscribe: reverseReader(subscribe)(eventStore),
        readAll: reverseReader(readAll)(eventStore),
        subscribeToAll: reverseReader(subscribeToAll)(eventStore),
    }
}
