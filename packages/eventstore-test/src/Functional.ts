import { event, EventData } from '@eventsource/events/Event'
import { EventStore, fromTaskEither, SubscribableEventStore, toTaskEither } from '@eventsource/eventstore/EventStore'
import { array, nonEmptyArray } from 'fp-ts'
import * as E from 'fp-ts/Either'
import type { NonEmptyArray } from 'fp-ts/NonEmptyArray'
import * as TE from 'fp-ts/TaskEither'
import { constTrue, flow, pipe } from 'fp-ts/function'
import * as RX from 'rxjs'
import * as RXO from 'rxjs/operators'
import { v4 as uuid } from 'uuid'
import * as assert from 'assert'

type Options = {
    es: SubscribableEventStore
}

export type DefaultEvent = EventData & {
    metadata: {
        revision: number
    }
}

export const defaultEvents: NonEmptyArray<DefaultEvent> = [
    event({
        type: 'Created',
        data: { foo: 'foo' },
        metadata: { revision: 0 },
    })(),
    event({
        type: 'Updated',
        data: { foo: 'foo1' },
        metadata: { revision: 1 },
    })(),
    event({
        type: 'Updated',
        data: { foo: 'foo2' },
        metadata: {
            revision: 2,
            bar: 'bar1',
        },
    })(),
]

const writeDefaultEvents = (streamId: string) => (es: EventStore) =>
    pipe(
        defaultEvents,
        nonEmptyArray.traverseWithIndex(TE.ApplicativeSeq)((i, e) =>
            es.appendToStream(streamId, e, { expectedRevision: BigInt(i - 1) })
        ),
        TE.map(nonEmptyArray.last)
    )

const getDefaultEventsExpectations = (streamId: string, filter: (e: DefaultEvent) => boolean = constTrue) =>
    pipe(
        defaultEvents,
        array.filter(filter),
        array.map(e =>
            expect.objectContaining({
                event: expect.objectContaining({
                    type: e.type,
                    data: e.data,
                    metadata: e.metadata,
                }),
                streamId,
                revision: BigInt(e.metadata.revision),
            })
        )
    )

const delayedAppendtoStream =
    (es: EventStore) =>
    (timer = 0) =>
        flow(es.appendToStream, f =>
            pipe(
                RX.timer(timer),
                RX.switchMap(() => RX.from(f())),
                RXO.switchMap(() => RX.EMPTY)
            )
        )

const toPromise = <A>(input: RX.Observable<A>): Promise<A[]> => pipe(input, RXO.toArray(), o$ => RX.lastValueFrom(o$))

const generateStreamId = () => `resource-${uuid()}`

export const test = ({ es }: Options) => {
    let streamId = generateStreamId()

    beforeEach(() => {
        streamId = generateStreamId()
    })

    afterEach(async () => {
        await es.deleteStream(streamId)()
    })

    it('should write events', async () => {
        const app = writeDefaultEvents(streamId)(es)

        const result = await app()
        assert.ok(E.isRight(result))
        assert.deepEqual(result.right, { revision: BigInt(2) })
    })

    it('should read events', async () => {
        const app = pipe(
            writeDefaultEvents(streamId)(es),
            TE.chain(() => pipe(es.readFromStream(streamId), toTaskEither))
        )

        const result = await app()
        assert.ok(E.isRight(result))
        expect(result.right).toEqual(getDefaultEventsExpectations(streamId))
    })

    it('should fail to write with lower expectedRevision', async () => {
        const app = pipe(
            TE.Do,
            TE.chain(() =>
                es.appendToStream(streamId, [
                    event({
                        type: 'Created',
                        data: { foo: 'foo' },
                    })(),
                ])
            ),
            TE.chain(({ revision }) =>
                es.appendToStream(
                    streamId,
                    [
                        event({
                            type: 'Updated',
                            data: { foo: 'foo1' },
                        })(),
                    ],
                    { expectedRevision: revision - BigInt(1) }
                )
            )
        )

        const result = await app()
        assert.ok(E.isLeft(result))
    })

    it('should delete stream', async () => {
        const app = pipe(
            TE.Do,
            TE.chain(() =>
                es.appendToStream(
                    streamId,
                    [
                        event({
                            type: 'Created',
                            data: { foo: 'foo' },
                        })(),
                    ],
                    { expectedRevision: -BigInt(1) }
                )
            ),
            TE.chain(() => pipe(es.readFromStream(streamId), toTaskEither))
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
            es.deleteStream(streamId),
            TE.chain(() => pipe(es.readFromStream(streamId), toTaskEither))
        )()

        assert.ok(E.isRight(result2))
        assert.deepStrictEqual(result2.right.length, 0)
    })

    it('should subscribe with catch-up', async () => {
        const trigger = () =>
            delayedAppendtoStream(es)()(
                streamId,
                event({
                    type: 'Updated',
                    data: {
                        bar: 'baz',
                    },
                    metadata: {},
                })(),
                { expectedRevision: BigInt(2) }
            )

        const app = pipe(
            writeDefaultEvents(streamId)(es),
            TE.chain(() =>
                pipe(
                    RX.merge(es.subscribe(streamId, { fromRevision: -BigInt(1) }), trigger()),
                    RXO.takeUntil(RX.timer(2000)),
                    RXO.take(4),
                    toTaskEither
                )
            )
        )

        const result = await app()
        assert.ok(E.isRight(result))
        expect(result.right).toEqual([
            ...getDefaultEventsExpectations(streamId),
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

    it('should subscribe from revision ', async () => {
        const trigger = () =>
            delayedAppendtoStream(es)()(
                streamId,
                event({
                    type: 'Updated',
                    data: {
                        bar: 'baz',
                    },
                    metadata: {},
                })(),
                { expectedRevision: BigInt(2) }
            )

        const app = pipe(
            writeDefaultEvents(streamId)(es),
            TE.chain(() =>
                pipe(
                    RX.merge(es.subscribe(streamId, { fromRevision: BigInt(1) }), trigger()),
                    RXO.takeUntil(RX.timer(2000)),
                    RXO.take(2),
                    toTaskEither
                )
            )
        )

        const result = await app()
        assert.ok(E.isRight(result))
        expect(result.right).toEqual([
            ...getDefaultEventsExpectations(streamId, ev => ev.metadata.revision >= 2),
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
        const trigger = () =>
            delayedAppendtoStream(es)()(
                streamId,
                event({
                    type: 'Updated',
                    data: {
                        bar: 'baz',
                    },
                    metadata: {},
                })(),
                { expectedRevision: BigInt(2) }
            )

        const app = () =>
            pipe(
                fromTaskEither(writeDefaultEvents(streamId)(es)),
                RXO.switchMap(() => RX.merge(es.subscribe(streamId, {}), trigger())),
                RXO.takeUntil(RX.timer(2000)),
                RXO.take(1),
                toPromise
            )

        const result = await app()
        expect(result).toEqual([
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

    it('should subscribeToAll with catch-up', async () => {
        const streamId2 = generateStreamId()

        const trigger = () =>
            delayedAppendtoStream(es)()(
                streamId2,
                event({
                    type: 'Updated',
                    data: {
                        bar: 'baz',
                    },
                    metadata: {},
                })(),
                { expectedRevision: -BigInt(1) }
            )

        const app = pipe(
            writeDefaultEvents(streamId)(es),
            TE.chain(() =>
                pipe(
                    RX.merge(es.subscribeToAll({ fromPosition: 'START' }), trigger()),
                    RXO.takeUntil(RX.of(null).pipe(RX.delay(1000))),
                    RXO.take(4),
                    toTaskEither
                )
            )
        )

        const result = await app()
        await es.deleteStream(streamId2)()
        assert.ok(E.isRight(result))
        expect(result.right).toEqual([
            ...getDefaultEventsExpectations(streamId),
            expect.objectContaining({
                event: expect.objectContaining({
                    type: 'Updated',
                    data: { bar: 'baz' },
                    metadata: {},
                }),
                streamId: streamId2,
                revision: BigInt(0),
            }),
        ])
    })

    it('should subscribeToAll from position', async () => {
        const streamId2 = generateStreamId()

        const trigger = () =>
            delayedAppendtoStream(es)()(
                streamId2,
                event({
                    type: 'Updated',
                    data: {
                        bar: 'baz',
                    },
                    metadata: {},
                })(),
                { expectedRevision: -BigInt(1) }
            )

        const app = pipe(
            writeDefaultEvents(streamId)(es),
            TE.chain(() =>
                pipe(
                    es.readAll({}),
                    RXO.filter(e => e.streamId === streamId && e.revision === BigInt(1)),
                    RXO.take(1),
                    RXO.switchMap(({ position }) => RX.merge(es.subscribeToAll({ fromPosition: position }), trigger())),
                    RXO.takeUntil(RX.of(null).pipe(RX.delay(1000))),
                    RXO.take(2),
                    toTaskEither
                )
            )
        )

        const result = await app()

        await es.deleteStream(streamId2)()
        assert.ok(E.isRight(result))
        expect(result.right).toEqual([
            ...getDefaultEventsExpectations(streamId, ev => ev.metadata.revision >= 2),
            expect.objectContaining({
                event: expect.objectContaining({
                    type: 'Updated',
                    data: { bar: 'baz' },
                    metadata: {},
                }),
                streamId: streamId2,
                revision: BigInt(0),
            }),
        ])
    })

    it('should subscribeToAll', async () => {
        const trigger = () =>
            delayedAppendtoStream(es)()(
                streamId,
                event({
                    type: 'Updated',
                    data: {
                        bar: 'baz',
                    },
                    metadata: {},
                })(),
                { expectedRevision: BigInt(2) }
            )

        const app = pipe(
            writeDefaultEvents(streamId)(es),
            TE.chain(() =>
                pipe(
                    RX.merge(es.subscribeToAll(), trigger()),
                    RXO.takeUntil(RX.of(null).pipe(RX.delay(2000))),
                    RXO.take(1),
                    toTaskEither
                )
            )
        )

        const result = await app()

        assert.ok(E.isRight(result))
        expect(result.right).toEqual([
            expect.objectContaining({
                event: expect.objectContaining({
                    type: 'Updated',
                    data: { bar: 'baz' },
                    metadata: {},
                }),
                streamId: streamId,
                revision: BigInt(3),
            }),
        ])
    })
}
