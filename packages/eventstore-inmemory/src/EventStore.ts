import type { Event } from '@eventsource/eventstore/Event'
import {
    AppendToStreamOptions,
    StoreEvent,
    ReadAllOptions,
    ReadFromStreamOptions,
    SubscribableEventStore,
    SubscribeOptions,
    SubscribeToAllOptions,
    ANY,
    NO_STREAM,
    BACKWARDS,
    END,
    ReadPosition,
    START,
    FORWARDS,
    ReadRevision,
    ReadDirection,
    DeleteStreamOptions,
    StoreAllEvent,
} from '@eventsource/eventstore/EventStore'
import { RevisionMismatchError, StreamNotFoundError } from '@eventsource/eventstore/errors'
import { array, readonlyArray } from 'fp-ts'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import { snd } from 'fp-ts/Tuple'
import { constVoid, flow, identity, pipe } from 'fp-ts/function'
import { throwIfAborted } from 'ix/aborterror'
import * as IX from 'ix/asynciterable'
import { AsyncSink } from 'ix/asynciterable'
import * as IXO from 'ix/asynciterable/operators'
import { wrapWithAbort } from 'ix/asynciterable/operators'
import * as RX from 'rxjs'

type MemoryEvent<E extends Event> = StoreEvent<E> & {
    position: string
}
type MemoryAllEvent<E extends Event> = MemoryEvent<E>

type StreamStore<E extends Event> = Map<bigint, MemoryEvent<E>>

type Store<E extends Event> = {
    sequence: bigint
    $all: Map<bigint, MemoryAllEvent<E>>
    stream$: RX.Subject<MemoryAllEvent<E>>
    streams: Map<string, StreamStore<E>>
}

const observableIterator = <TSource>(obs$: RX.Observable<TSource>): AsyncIterable<TSource> => {
    return {
        [Symbol.asyncIterator]: async function* (signal?: AbortSignal) {
            throwIfAborted(signal)

            const sink: AsyncSink<TSource> = new AsyncSink<TSource>()
            const subscription = obs$.subscribe({
                next(value: TSource) {
                    if (signal?.aborted) {
                        return
                    }
                    sink.write(value)
                },
                error(err: unknown) {
                    sink.error(err)
                },
                complete() {
                    sink.end()
                },
            })

            const abort = () => {
                sink.end()
            }

            try {
                signal?.addEventListener('abort', abort, { once: true })
                for (let next; !(next = await sink.next()).done; ) {
                    yield next.value
                }
            } finally {
                signal?.removeEventListener('abort', abort)
                subscription.unsubscribe()
            }
        },
    }
}

export const appendToStream =
    ({ stream, expectedRevision = ANY }: AppendToStreamOptions) =>
    <E extends Event>(events: E | ReadonlyArray<E>) =>
    (state: Store<E>) =>
        pipe(
            TE.Do,
            TE.chain(() => {
                const streamMap = state.streams.get(stream) || new Map<bigint, MemoryEvent<E>>()

                let revision = BigInt(streamMap.size) - BigInt(1)

                switch (expectedRevision) {
                    case NO_STREAM:
                        // no events means we dont have the stream
                        if (revision !== BigInt(-1)) {
                            return TE.left(new RevisionMismatchError(BigInt(-1), revision))
                        }
                        break
                    case ANY:
                        // ok, we can use the current revision
                        break
                    default:
                        // specific revision
                        if (revision !== expectedRevision) {
                            return TE.left(new RevisionMismatchError(BigInt(-1), revision))
                        }
                }

                const timestamp = Date.now()

                pipe(
                    Array.isArray(events) ? events : readonlyArray.of(events),
                    readonlyArray.map(event => {
                        state.sequence++

                        const newEvent = {
                            event,
                            stream,
                            revision: ++revision,
                            timestamp,
                            position: state.sequence.toString(),
                        }
                        streamMap.set(newEvent.revision, newEvent)
                        state.$all.set(state.sequence, newEvent)
                        state.stream$.next(newEvent)
                    })
                )

                if (!state.streams.has(stream)) {
                    state.streams.set(stream, streamMap)
                }

                return TE.of({ revision })
            })
        )

const getFilter = <E extends Event>(
    fromRevision: ReadRevision,
    direction: ReadDirection
): ((event: StoreEvent<E>) => boolean) => {
    if (direction === BACKWARDS) {
        switch (fromRevision) {
            case START:
                return _event => false
            case END:
                return _event => true
        }
        return ev => ev.revision < fromRevision
    }

    switch (fromRevision) {
        case START:
            return _event => true
        case END:
            return _event => false
    }

    return ev => ev.revision > fromRevision
}

export const readStream =
    ({ stream, fromRevision = START, direction = FORWARDS, maxCount, signal }: ReadFromStreamOptions) =>
    <E extends Event>(store: Store<E>): AsyncIterable<MemoryEvent<E>> =>
        pipe(
            IX.defer(() =>
                pipe(
                    store.streams.get(stream),
                    O.fromNullable,
                    O.map(
                        flow(
                            IX.from,
                            direction === BACKWARDS ? IXO.reverse() : identity,
                            IXO.map(snd),
                            IXO.filter(ev => ev.stream === stream && getFilter(fromRevision, direction)(ev)),
                            maxCount ? IXO.take(maxCount) : identity
                        )
                    ),
                    O.getOrElse((): AsyncIterable<MemoryEvent<E>> => IX.throwError(new StreamNotFoundError(stream)))
                )
            ),
            source => wrapWithAbort(source, signal)
        )

export const deleteStream =
    ({ stream }: DeleteStreamOptions) =>
    <E extends Event>(store: Store<E>) =>
        pipe(
            TE.Do,
            TE.chain(() =>
                pipe(
                    store.streams.get(stream),
                    O.fromNullable,
                    O.chainFirst(streamMap =>
                        pipe(
                            Array.from(streamMap.entries()),
                            array.chainFirst(([, ev]) => {
                                store.$all.delete(BigInt(ev.position))
                                return []
                            }),
                            O.some
                        )
                    ),
                    O.chainFirst(() => pipe(store.streams.delete(stream), O.some)),
                    () => TE.right(constVoid())
                )
            )
        )

const getPositionFilter = <E extends Event>(
    fromPosition: ReadPosition,
    direction: ReadDirection
): ((event: StoreAllEvent<E>) => boolean) => {
    if (direction === BACKWARDS) {
        switch (fromPosition) {
            case START:
                return _event => false
            case END:
                return _event => true
        }
        return ev => ev.position < fromPosition
    }

    switch (fromPosition) {
        case START:
            return _event => true
        case END:
            return _event => false
    }

    return ev => ev.position > fromPosition
}

export const readAll =
    ({ fromPosition = START, direction = FORWARDS, maxCount, signal }: ReadAllOptions = {}) =>
    <E extends Event>(store: Store<E>): AsyncIterable<MemoryAllEvent<E>> =>
        pipe(
            IX.defer(() =>
                pipe(
                    IX.from(store.$all.entries()),
                    direction === BACKWARDS ? IXO.reverse() : identity,
                    IXO.map(snd),
                    IXO.filter(getPositionFilter(fromPosition, direction)),
                    maxCount ? IXO.take(maxCount) : identity
                )
            ),
            source => wrapWithAbort(source, signal)
        )

const getStreamRevision =
    (streamId: string) =>
    <E extends Event>(store: Store<E>) =>
        pipe(
            store.streams.get(streamId),
            O.fromNullable,
            O.map(stream => BigInt(stream.size - 1)),
            O.getOrElse(() => BigInt(-1))
        )

export const subscribe =
    ({ stream: streamId, fromRevision, signal }: SubscribeOptions) =>
    <E extends Event>(store: Store<E>): AsyncIterable<MemoryEvent<E>> =>
        pipe(
            IX.defer(() =>
                pipe(
                    undefined === fromRevision
                        ? pipe(
                              observableIterator(store.stream$),
                              IXO.filter(ev => ev.stream === streamId)
                          )
                        : pipe(
                              getStreamRevision(streamId)(store), //
                              currentRevision =>
                                  pipe(
                                      readStream({
                                          stream: streamId,
                                          fromRevision: fromRevision,
                                          signal,
                                      })(store),
                                      IXO.concatWith(
                                          pipe(
                                              observableIterator(store.stream$),
                                              IXO.filter(ev => ev.stream === streamId && ev.revision > currentRevision)
                                          )
                                      )
                                  )
                          )
                )
            ),
            source => IXO.wrapWithAbort(source, signal)
        )

export const subscribeToAll =
    <SE extends Event>({ fromPosition, signal }: SubscribeToAllOptions = {}) =>
    <E extends SE>(store: Store<E>) =>
        pipe(
            IX.defer(() =>
                undefined === fromPosition
                    ? observableIterator(store.stream$)
                    : pipe(IX.concat(readAll({ fromPosition })(store), observableIterator(store.stream$)))
            ),
            source => wrapWithAbort(source, signal)
        )

export const createStore = <E extends Event>(): Store<E> => ({
    sequence: BigInt(0),
    $all: new Map<bigint, MemoryAllEvent<E>>(),
    stream$: new RX.Subject<MemoryAllEvent<E>>(),
    streams: new Map<string, StreamStore<E>>(),
})

export const create = <E extends Event>(store?: Store<E>): SubscribableEventStore<E> => {
    const eventStore = store || createStore<E>()

    return {
        appendToStream: options => events => appendToStream(options)(events)(eventStore),
        readStream: options => readStream(options)(eventStore),
        deleteStream: options => deleteStream(options)(eventStore),
        subscribe: options => subscribe(options)(eventStore),
        readAll: options => readAll(options)(eventStore),
        subscribeToAll: options => subscribeToAll(options)(eventStore),
    }
}
