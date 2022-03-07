import { event, Event } from '@eventsource/eventstore/Event'
import { EventStore, NO_STREAM, SubscribableEventStore } from '@eventsource/eventstore/EventStore'
import { RevisionMismatchError, StreamNotFoundError } from '@eventsource/eventstore/errors'
import { io, readonlyArray, readonlyNonEmptyArray } from 'fp-ts'
import * as E from 'fp-ts/Either'
import type { ReadonlyNonEmptyArray } from 'fp-ts/ReadonlyNonEmptyArray'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { constTrue, pipe } from 'fp-ts/function'
import { AbortError, throwIfAborted } from 'ix/aborterror'
import * as IX from 'ix/asynciterable'
import * as IXO from 'ix/asynciterable/operators'
import { v4 as uuid } from 'uuid'
import * as assert from 'assert'
//import { AbortError } from 'ix/aborterror';

type Options<ES extends SubscribableEventStore> = {
    eventStoreProvider: () => ES
}

export type DefaultEvent = Event & {
    metadata: {
        revision: number
    }
}

export const getDefaultEvents = () =>
    pipe(
        [
            event({
                type: 'Created',
                data: { foo: 'foo' },
                metadata: { revision: 0 },
            }),
            event({
                type: 'Updated',
                data: { foo: 'foo1' },
                metadata: { revision: 1 },
            }),
            event({
                type: 'Updated',
                data: { foo: 'foo2' },
                metadata: {
                    revision: 2,
                    bar: 'bar1',
                },
            }),
        ] as ReadonlyNonEmptyArray<() => DefaultEvent>,
        io.traverseReadonlyNonEmptyArrayWithIndex((_, e) => e)
    )

const writeDefaultEvents = (stream: string) => (es: EventStore) =>
    pipe(
        TE.fromIO<ReadonlyNonEmptyArray<DefaultEvent>, Error>(getDefaultEvents()),
        TE.chain(
            readonlyNonEmptyArray.traverseWithIndex(TE.ApplicativeSeq)((i, e) =>
                es.appendToStream({ stream, expectedRevision: BigInt(i - 1) })(e)
            )
        ),
        TE.map(readonlyNonEmptyArray.last)
    )

const getDefaultEventsExpectations = (stream: string, filter: (e: DefaultEvent) => boolean = constTrue) =>
    pipe(
        getDefaultEvents()(),
        readonlyArray.filter(filter),
        readonlyArray.map(e =>
            expect.objectContaining({
                event: expect.objectContaining({
                    type: e.type,
                    data: e.data,
                    metadata: e.metadata,
                }),
                stream,
                revision: BigInt(e.metadata.revision),
            })
        ),
        readonlyArray.toArray
    )

const streamToTaskEither = <A>(input: AsyncIterable<A>): TE.TaskEither<Error, A[]> => {
    const controller = new AbortController()
    return pipe(
        TE.tryCatch(() => pipe(input, IXO.withAbort(controller.signal), IX.toArray), E.toError),
        T.chainFirst(() => T.of(controller.abort()))
    )
}

const taskEitherToStream = <A>(input: TE.TaskEither<Error, A>): AsyncIterable<A> =>
    pipe(
        IX.defer(signal => {
            throwIfAborted(signal)

            return pipe(input, TE.match(IX.throwError, IX.of), task => IX.from(task()), IXO.mergeAll())
        })
    )

const tapOnFirst: <A>(f: (a: A) => any) => (am: AsyncIterable<A>) => AsyncIterable<A> = f => {
    let done = false

    return IXO.tap(a => {
        done || f(a)
        done = true
    })
}

const generateStreamId = () => `resource-${uuid()}`

export const test = <ES extends SubscribableEventStore>({ eventStoreProvider }: Options<ES>) => {
    let stream = generateStreamId()
    let stream2 = generateStreamId()
    let es = eventStoreProvider()

    beforeEach(() => {
        stream = generateStreamId()
        stream2 = generateStreamId()
        es = eventStoreProvider()
    })

    afterEach(async () => {
        await es.deleteStream({ stream })()
        await es.deleteStream({ stream: stream2 })()
    })

    it('should write events', async () => {
        const app = writeDefaultEvents(stream)(es)

        const result = await app()
        expect(result).toStrictEqual(E.right({ revision: BigInt(2) }))
    })

    it('should write events in append-only', async () => {
        const app = pipe(
            es.appendToStream({ stream })(event({ type: 'Event1', data: {} })()),
            TE.chain(() => es.appendToStream({ stream })(event({ type: 'Event2', data: {} })())),
            TE.chain(() => es.appendToStream({ stream })(event({ type: 'Event3', data: {} })()))
        )

        const result = await app()
        expect(result).toStrictEqual(E.right({ revision: BigInt(2) }))
    })

    it('should write events in append-only (NO_STREAM)', async () => {
        const app = pipe(
            es.appendToStream({ stream, expectedRevision: NO_STREAM })(event({ type: 'Event1', data: {} })()),
            TE.chain(() => es.appendToStream({ stream })(event({ type: 'Event2', data: {} })())),
            TE.chain(() => es.appendToStream({ stream })(event({ type: 'Event3', data: {} })()))
        )

        const result = await app()
        expect(result).toStrictEqual(E.right({ revision: BigInt(2) }))
    })

    it('should throw "RevisionMismatchError" writing events in append-only (NO_STREAM) when stream exists', async () => {
        const app = pipe(
            es.appendToStream({ stream })(event({ type: 'Event1', data: {} })()),
            TE.chain(() =>
                es.appendToStream({ stream, expectedRevision: NO_STREAM })(event({ type: 'Event2', data: {} })())
            )
        )

        const result = await app()
        assert.ok(E.isLeft(result))
        expect(result.left).toBeInstanceOf(RevisionMismatchError)
    })

    it('should throw "RevisionMismatchError" writing events on version mismatch', async () => {
        const app = pipe(
            es.appendToStream({ stream })(event({ type: 'Event1', data: {} })()),
            TE.chain(() => es.appendToStream({ stream })(event({ type: 'Event1', data: {} })())),
            TE.chain(() =>
                es.appendToStream({ stream, expectedRevision: BigInt(0) })(event({ type: 'Event2', data: {} })())
            )
        )

        const result = await app()
        assert.ok(E.isLeft(result))
        expect(result.left).toBeInstanceOf(RevisionMismatchError)
    })

    it('should throw "StreamNotFoundError" reading events from empty stream', async () => {
        const result = await streamToTaskEither(es.readStream({ stream }))()
        assert.ok(E.isLeft(result))
        expect(result.left).toBeInstanceOf(StreamNotFoundError)
    })

    it('should throw "StreamNotFoundError" reading events fromRevision: -1n', async () => {
        const result = await streamToTaskEither(es.readStream({ stream, fromRevision: BigInt(-1) }))()
        assert.ok(E.isLeft(result))
        expect(result.left).toBeInstanceOf(StreamNotFoundError)
    })

    it('should not throw AbortError on readStream abort', async () => {
        await writeDefaultEvents(stream)(es)()

        const controller = new AbortController()

        const result = await pipe(
            es.readStream({ stream, signal: controller.signal }),
            IXO.take(1),
            IXO.flatMap(() => IX.empty()),
            IXO.finalize(() => controller.abort()),
            IX.toArray
        )

        expect(result).toStrictEqual([])
    })

    it('should read stream events', async () => {
        const app = pipe(
            writeDefaultEvents(stream)(es),
            TE.chain(() => pipe(es.readStream({ stream }), streamToTaskEither))
        )

        const result = await app()
        expect(result).toStrictEqual(E.right(getDefaultEventsExpectations(stream)))
    })

    it('should read stream events from specific revision', async () => {
        const app = pipe(
            writeDefaultEvents(stream)(es),
            TE.chain(() => pipe(es.readStream({ stream, fromRevision: BigInt(1) }), streamToTaskEither))
        )

        const result = await app()
        expect(result).toStrictEqual(E.right(getDefaultEventsExpectations(stream, ev => ev.metadata.revision > 1)))
    })

    it('should read stream events from START', async () => {
        const app = pipe(
            writeDefaultEvents(stream)(es),
            TE.chain(() => pipe(es.readStream({ stream, fromRevision: 'START' }), streamToTaskEither))
        )

        const result = await app()
        expect(result).toStrictEqual(E.right(getDefaultEventsExpectations(stream)))
    })

    it('should read stream events from END', async () => {
        const app = pipe(
            writeDefaultEvents(stream)(es),
            TE.chain(() => pipe(es.readStream({ stream, fromRevision: 'END' }), streamToTaskEither))
        )

        const result = await app()
        expect(result).toStrictEqual(E.right([]))
    })

    it('should read stream events with maxCount', async () => {
        const app = pipe(
            writeDefaultEvents(stream)(es),
            TE.chain(() => pipe(es.readStream({ stream, maxCount: 1 }), streamToTaskEither))
        )

        const result = await app()
        expect(result).toStrictEqual(E.right(getDefaultEventsExpectations(stream, ev => ev.metadata.revision === 0)))
    })

    it('should read stream events BACKWARDS', async () => {
        const app = pipe(
            writeDefaultEvents(stream)(es),
            TE.chain(() =>
                pipe(es.readStream({ stream, direction: 'BACKWARDS', fromRevision: 'END' }), streamToTaskEither)
            )
        )

        const result = await app()
        expect(result).toStrictEqual(E.right(getDefaultEventsExpectations(stream).reverse()))
    })

    it('should read stream events BACKWARDS from specific revision', async () => {
        const app = pipe(
            writeDefaultEvents(stream)(es),
            TE.chain(() =>
                pipe(es.readStream({ stream, fromRevision: BigInt(1), direction: 'BACKWARDS' }), streamToTaskEither)
            )
        )

        const result = await app()
        expect(result).toStrictEqual(
            E.right(getDefaultEventsExpectations(stream, ev => ev.metadata.revision < 1).reverse())
        )
    })

    it('should read stream events BACKWARDS from START', async () => {
        const app = pipe(
            writeDefaultEvents(stream)(es),
            TE.chain(() =>
                pipe(es.readStream({ stream, fromRevision: 'START', direction: 'BACKWARDS' }), streamToTaskEither)
            )
        )

        const result = await app()
        expect(result).toStrictEqual(E.right([]))
    })

    it('should read all events', async () => {
        await writeDefaultEvents(stream)(es)()
        await writeDefaultEvents(stream2)(es)()

        const result = await pipe(es.readAll(), IX.toArray)

        expect(result).toStrictEqual([
            ...getDefaultEventsExpectations(stream),
            ...getDefaultEventsExpectations(stream2),
        ])
    })

    it('should read all events from specific position', async () => {
        await writeDefaultEvents(stream)(es)()
        await writeDefaultEvents(stream2)(es)()

        const allEvents = await pipe(es.readAll(), IX.toArray)

        expect(allEvents).toStrictEqual([
            ...getDefaultEventsExpectations(stream),
            ...getDefaultEventsExpectations(stream2),
        ])

        const fromPositionEvents = await pipe(es.readAll({ fromPosition: allEvents[2].position }), IX.toArray)

        expect(fromPositionEvents).toStrictEqual([...getDefaultEventsExpectations(stream2)])
    })

    it('should read all events from START', async () => {
        await writeDefaultEvents(stream)(es)()
        await writeDefaultEvents(stream2)(es)()

        const result = await pipe(es.readAll(), IX.toArray)

        expect(result).toStrictEqual([
            ...getDefaultEventsExpectations(stream),
            ...getDefaultEventsExpectations(stream2),
        ])
    })

    it('should read all events from END', async () => {
        await writeDefaultEvents(stream)(es)()
        await writeDefaultEvents(stream2)(es)()

        const result = await pipe(es.readAll({ fromPosition: 'END' }), IX.toArray)
        expect(result).toStrictEqual([])
    })

    it('should read all events with maxCount', async () => {
        await writeDefaultEvents(stream)(es)()

        const result = await pipe(es.readAll({ maxCount: 1 }), IX.toArray)
        expect(result).toStrictEqual(getDefaultEventsExpectations(stream, ev => ev.metadata.revision === 0))
    })

    it('should read all events BACKWARDS', async () => {
        await writeDefaultEvents(stream)(es)()
        await writeDefaultEvents(stream2)(es)()

        const result = await pipe(es.readAll({ direction: 'BACKWARDS', fromPosition: 'END' }), IX.toArray)

        expect(result).toStrictEqual(
            [...getDefaultEventsExpectations(stream), ...getDefaultEventsExpectations(stream2)].reverse()
        )
    })

    it('should read all events BACKWARDS from specific revision', async () => {
        await writeDefaultEvents(stream)(es)()
        await writeDefaultEvents(stream2)(es)()

        const allEvents = await pipe(es.readAll(), IX.toArray)

        expect(allEvents).toStrictEqual([
            ...getDefaultEventsExpectations(stream),
            ...getDefaultEventsExpectations(stream2),
        ])

        const fromPositionEvents = await pipe(
            es.readAll({ direction: 'BACKWARDS', fromPosition: allEvents[3].position }),
            IX.toArray
        )

        expect(fromPositionEvents).toStrictEqual(getDefaultEventsExpectations(stream).reverse())
    })

    it('should read all events BACKWARDS from START', async () => {
        await writeDefaultEvents(stream)(es)()
        await writeDefaultEvents(stream2)(es)()

        const result = await pipe(es.readAll({ direction: 'BACKWARDS', fromPosition: 'START' }), IX.toArray)

        expect(result).toStrictEqual([])
    })

    it('should delete stream', async () => {
        const app = pipe(
            TE.Do,
            TE.chain(() =>
                es.appendToStream({ stream, expectedRevision: BigInt(-1) })(
                    event({
                        type: 'Created',
                        data: { foo: 'foo' },
                    })()
                )
            ),
            TE.chain(() => pipe(es.readStream({ stream }), streamToTaskEither))
        )

        const result = await app()
        assert.ok(E.isRight(result))
        expect(result.right).toEqual([
            expect.objectContaining({
                event: expect.objectContaining({
                    type: 'Created',
                    data: { foo: 'foo' },
                    metadata: {},
                }),
                revision: BigInt(0),
            }),
        ])

        const result2 = await pipe(
            es.deleteStream({ stream }),
            TE.chain(() => pipe(es.readStream({ stream }), streamToTaskEither))
        )()

        assert.ok(E.isLeft(result2))
        expect(result2.left).toBeInstanceOf(StreamNotFoundError)
    })

    it('should not throw AbortError on subscribe abort', async () => {
        const controller = new AbortController()

        const result = await pipe(
            es.subscribe({ stream, signal: controller.signal }),
            IXO.mergeWith(
                pipe(
                    IX.from([0]),
                    IXO.delay(5),
                    IXO.tap(() => controller.abort()),
                    IXO.flatMap(() => IX.empty())
                )
            ),
            IX.toArray
        )

        expect(result).toStrictEqual([])
    })

    it('should subscribe with catch-up', async () => {
        const ev = event({
            type: 'Updated',
            data: {
                bar: 'baz',
            },
            metadata: {},
        })()

        await writeDefaultEvents(stream)(es)()

        const result = await pipe(
            es.subscribe({ stream, fromRevision: BigInt(-1) }),
            tapOnFirst(() => es.appendToStream({ stream, expectedRevision: BigInt(2) })(ev)()),
            IXO.take(4),
            IX.toArray
        )

        expect(result).toStrictEqual([
            ...getDefaultEventsExpectations(stream),
            expect.objectContaining({
                event: expect.objectContaining({
                    type: 'Updated',
                    data: { bar: 'baz' },
                    metadata: {},
                }),
                revision: BigInt(3),
            }),
        ])
    })

    it('should subscribe from revision', async () => {
        const ev = event({
            type: 'Updated',
            data: {
                bar: 'baz',
            },
            metadata: {},
        })()

        await writeDefaultEvents(stream)(es)()

        const result = await pipe(
            es.subscribe({ stream, fromRevision: BigInt(1) }),
            tapOnFirst(() => es.appendToStream({ stream })(ev)()),
            IXO.take(2),
            IX.toArray
        )

        expect(result).toStrictEqual([
            ...getDefaultEventsExpectations(stream, e => e.metadata.revision >= 2),
            expect.objectContaining({
                event: expect.objectContaining({
                    type: 'Updated',
                    data: { bar: 'baz' },
                    metadata: {},
                }),
                revision: BigInt(3),
            }),
        ])
    })

    it('should subscribe', async () => {
        const ev = event({
            type: 'Updated',
            data: {
                bar: 'baz',
            },
            metadata: {},
        })()

        await writeDefaultEvents(stream)(es)()

        const controller = new AbortController()

        const result = await pipe(
            IX.merge(
                pipe(
                    es.subscribe({ stream, signal: controller.signal }),
                    IXO.catchError(error => (error instanceof AbortError ? IX.empty() : IX.throwError(error)))
                ),
                pipe(
                    es.appendToStream({ stream, expectedRevision: BigInt(2) })(ev),
                    taskEitherToStream,
                    IXO.delay(5),
                    IXO.flatMap(() => IX.empty())
                )
            ),
            IXO.take(1),
            IXO.finalize(() => controller.abort()),
            IX.toArray
        )

        expect(result).toStrictEqual([
            expect.objectContaining({
                event: expect.objectContaining({
                    type: 'Updated',
                    data: { bar: 'baz' },
                    metadata: {},
                }),
                revision: BigInt(3),
            }),
        ])
    })

    it('should not throw AbortError on subscribeToAll abort', async () => {
        const controller = new AbortController()

        const result = await pipe(
            es.subscribeToAll({ signal: controller.signal }),
            IXO.mergeWith(
                pipe(
                    IX.from([0]),
                    IXO.delay(5),
                    IXO.tap(() => controller.abort()),
                    IXO.flatMap(() => IX.empty())
                )
            ),
            IX.toArray
        )

        expect(result).toStrictEqual([])
    })

    it('should subscribeToAll with catch-up', async () => {
        const ev = event({
            type: 'Updated2',
            data: {
                bar: 'baz',
            },
            metadata: {},
        })()

        await writeDefaultEvents(stream)(es)()

        const controller = new AbortController()

        const app = () =>
            pipe(
                es.subscribeToAll({ fromPosition: 'START', signal: controller.signal }),
                tapOnFirst(() => es.appendToStream({ stream: stream2, expectedRevision: NO_STREAM })(ev)()),
                IXO.take(4),
                IXO.finalize(() => controller.abort()),
                IX.toArray
            )

        const result = await app()

        const expected = [
            ...getDefaultEventsExpectations(stream),
            expect.objectContaining({
                event: expect.objectContaining({
                    id: ev.id,
                    type: ev.type,
                    data: ev.data,
                    metadata: ev.metadata,
                }),
                stream: stream2,
                revision: BigInt(0),
            }),
        ]

        expect(result).toStrictEqual(expected)
    })

    it('should subscribeToAll from position', async () => {
        const ev = event({
            type: 'Updated',
            data: {
                bar: 'baz',
            },
            metadata: {},
        })()

        const controller = new AbortController()

        await writeDefaultEvents(stream)(es)()

        const result = await pipe(
            es.readAll({ signal: controller.signal }),
            IXO.filter(e => e.stream === stream && e.revision === BigInt(1)),
            IXO.take(1),
            IXO.flatMap(({ position }) => es.subscribeToAll({ fromPosition: position, signal: controller.signal })),
            tapOnFirst(() => es.appendToStream({ stream: stream2, expectedRevision: NO_STREAM })(ev)()),
            IXO.take(2),
            IXO.finalize(() => controller.abort()),
            IX.toArray
        )

        expect(result).toStrictEqual([
            ...getDefaultEventsExpectations(stream, e => e.metadata.revision >= 2),
            expect.objectContaining({
                event: expect.objectContaining({
                    type: 'Updated',
                    data: { bar: 'baz' },
                    metadata: {},
                }),
                stream: stream2,
                revision: BigInt(0),
            }),
        ])
    })

    it('should subscribeToAll', async () => {
        const ev = event({
            type: 'Updated',
            data: {
                bar: 'baz',
            },
            metadata: {},
        })()

        const controller = new AbortController()

        await writeDefaultEvents(stream)(es)()

        const result = await pipe(
            IX.merge(
                pipe(es.subscribeToAll({ signal: controller.signal })),
                pipe(
                    es.appendToStream({ stream, expectedRevision: BigInt(2) })(ev),
                    taskEitherToStream,
                    IXO.delay(5),
                    IXO.flatMap(() => IX.empty())
                )
            ),
            IXO.take(1),
            IXO.finalize(() => controller.abort()),
            IX.toArray
        )

        expect(result).toStrictEqual([
            expect.objectContaining({
                event: expect.objectContaining({
                    type: 'Updated',
                    data: { bar: 'baz' },
                    metadata: {},
                }),
                stream: stream,
                revision: BigInt(3),
            }),
        ])
    })
}
