import type { Event, EventOf } from '@eventsource/eventstore/Event'
import type { EventStore, StoreEvent } from '@eventsource/eventstore/EventStore'
import { array } from 'fp-ts'
import * as E from 'fp-ts/Either'
import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'

export type AggregateId = string

export type Aggregate<S = unknown> = {
    readonly id: AggregateId
    readonly data: S
    readonly revision: bigint
}

export type Apply<E, A = any> = (event: E) => (state: A) => A
export type Replay<E, A = any> = (events: AsyncIterable<E>) => <R extends A = A>(state: A) => TE.TaskEither<Error, R>
export type AggregateApply<E extends Event, A extends Aggregate> = Apply<EventOf<E>, A['data']>

type Dependencies<A extends Aggregate, E extends Event> = {
    readonly store: EventStore<E>
    readonly apply: AggregateApply<E, A>
}

export const createAggegate =
    <S>(data: S) =>
    (id: string): Aggregate<S> => ({
        id,
        data,
        revision: BigInt(-1),
    })

const aggregateReply =
    <E extends Event, A extends Aggregate>(aggregate: A, apply: AggregateApply<E, A>) =>
    (events: AsyncIterable<StoreEvent<E>>) =>
        TE.tryCatch(async () => {
            let state = aggregate
            for await (const event of events) {
                state = {
                    ...state,
                    data: apply(event.event)(state.data),
                    revision: event.revision,
                }
            }
            return state
        }, E.toError)

export const load =
    <A extends Aggregate>(aggregate: A) =>
    <E extends Event>({ store, apply }: Dependencies<A, E>) =>
        pipe(
            store.readStream({ stream: aggregate.id, fromRevision: aggregate.revision }),
            aggregateReply(aggregate, apply)
        )

export const save =
    <A extends Aggregate, E extends Event>(aggregate: A) =>
    (events: E | ReadonlyArray<E>) =>
    ({ store, apply }: Dependencies<A, E>): TE.TaskEither<Error, A> =>
        pipe(
            events,
            store.appendToStream({ stream: aggregate.id, expectedRevision: aggregate.revision }),
            TE.map(({ revision }) =>
                pipe(
                    Array.isArray(events) ? events : [events],
                    array.reduce(aggregate, (acc, event) => ({
                        ...acc,
                        data: apply(event)(acc),
                        revision,
                    }))
                )
            )
        )
