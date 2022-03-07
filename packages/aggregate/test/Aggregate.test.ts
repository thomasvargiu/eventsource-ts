import { event, EventFromCreator } from '@eventsource/eventstore/Event'
import { StreamNotFoundError } from '@eventsource/eventstore/errors'
import * as E from 'fp-ts/Either'
import * as RTE from 'fp-ts/ReaderTaskEither'
import { pipe } from 'fp-ts/function'
import * as MES from '../../eventstore-inmemory/src/EventStore'
import * as _ from '../src/Aggregate'

describe('Aggregate', () => {
    it('should create aggregate', () => {
        const result = _.createAggegate('foo')('bar')

        expect(result).toStrictEqual({
            id: 'bar',
            data: 'foo',
            revision: BigInt(-1),
        })
    })

    it('should throw StreamNotFound on empty stream', async () => {
        const aggregate = _.createAggegate('foo')('bar')

        const store = MES.create()

        const result = await pipe(
            _.load(aggregate)({
                store,
                apply: _event => _state => {
                    return 'edit'
                },
            })
        )()

        expect(result).toStrictEqual(E.left(new StreamNotFoundError('bar')))
    })

    it('should load aggregate', async () => {
        const stream = 'user-1'
        const aggregate = _.createAggegate('foo')(stream)

        const created = event({ type: 'Create', data: 'edit' })

        const store = MES.create<ReturnType<typeof created>>()

        const app = pipe(
            RTE.fromIO(created),
            RTE.chainTaskEitherKW(store.appendToStream({ stream })),
            RTE.chainW(() => _.load(aggregate))
        )

        const result = await app({
            store,
            apply: e => _state => e.data,
        })()

        expect(result).toStrictEqual(
            E.right({
                ...aggregate,
                data: 'edit',
                revision: BigInt(0),
            })
        )
    })

    it('should save new aggregate', async () => {
        const stream = 'user-1'
        const aggregate = _.createAggegate('foo')(stream)

        const created = event({ type: 'Create', data: 'edit' })

        const store = MES.create<ReturnType<typeof created>>()

        const app = pipe(
            RTE.fromIO(created), //
            RTE.chainW(_.save(aggregate))
        )

        const result = await app({
            store,
            apply: e => _state => e.data,
        })()

        expect(result).toStrictEqual(
            E.right({
                ...aggregate,
                data: 'edit',
                revision: BigInt(0),
            })
        )

        const result2 = await _.load(aggregate)({
            store,
            apply: e => _state => e.data,
        })()

        expect(result2).toStrictEqual(
            E.right({
                ...aggregate,
                data: 'edit',
                revision: BigInt(0),
            })
        )
    })

    it('should save existing aggregate', async () => {
        const stream = 'user-1'
        const aggregate = _.createAggegate('foo')(stream)

        const updated = (data: string) => event({ type: 'Updated', data })

        type TestEvent = EventFromCreator<typeof updated>
        const store = MES.create<TestEvent>()

        const deps = {
            store,
            apply: (e: TestEvent) => (_state: any) => e.data,
        }

        const app = pipe(
            RTE.fromIO(updated('created')), //
            RTE.chainW(_.save(aggregate)),
            RTE.chain(a =>
                pipe(
                    RTE.fromIO(updated('updated')), //
                    RTE.chainW(_.save(a))
                )
            )
        )

        const result = await app(deps)()

        expect(result).toStrictEqual(
            E.right({
                ...aggregate,
                data: 'updated',
                revision: BigInt(1),
            })
        )

        const result2 = await _.load(aggregate)(deps)()

        expect(result2).toStrictEqual(
            E.right({
                ...aggregate,
                data: 'updated',
                revision: BigInt(1),
            })
        )
    })
})
