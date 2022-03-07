/* eslint-disable no-bitwise */
import type { Event } from '@eventsource/eventstore/Event'
import { BACKWARDS, END, ReadPosition, StoreAllEvent, SubscribeToAllOptions } from '@eventsource/eventstore/EventStore'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Reader'
import { flow, pipe } from 'fp-ts/function'
import * as IX from 'ix/asynciterable'
import * as IXO from 'ix/asynciterable/operators'
import { ChangeStreamOptions, Long } from 'mongodb'
import type { MongoEvent } from '../EventStore'
import { timestampFromMs } from '../internal/Timestamp'
import { schemaToStoreEvent } from '../internal/schemaToStoreEvent'
import { genericSubscribe } from './genericSubscribe'
import { readAll } from './readAll'

const startSubscribe = <E extends Event>(fromTimestamp?: number, options?: ChangeStreamOptions) =>
    pipe(
        genericSubscribe<E>(
            {
                ...(fromTimestamp ? { 'fullDocument.timestamp': { $gte: Long.fromNumber(fromTimestamp) } } : {}),
            },
            options
        ),
        R.map(IXO.map(event => schemaToStoreEvent(event.fullDocument)))
    )

const subscribeFromTimestamp = <E extends Event>(timestamp: number) =>
    startSubscribe<E>(timestamp, {
        startAtOperationTime: timestampFromMs(timestamp),
    })

const subscribeNonEmptyStream =
    <E extends Event>(fromPosition: ReadPosition) =>
    (lastEvent: StoreAllEvent) =>
        pipe(
            ({ clockSkew = 60, subscribeStart = 0 }) =>
                pipe(
                    R.Do,
                    R.chain(() => () => IX.defer(() => IX.of(Date.now()))),
                    chainW(now =>
                        pipe(
                            readAll<E>({ fromPosition }),
                            R.map(
                                IXO.flatMap(value =>
                                    pipe(
                                        IX.of(value),
                                        IXO.takeWhile(ev => ev.event.id !== lastEvent.event.id),
                                        IXO.endWith(value),
                                        IXO.distinctUntilChanged({
                                            comparer: (a, b) => a.event.id === b.event.id,
                                        })
                                    )
                                )
                            ),
                            R.chainW(r$ =>
                                pipe(
                                    lastEvent.timestamp > now - clockSkew * 1000
                                        ? pipe(
                                              subscribeFromTimestamp<E>(
                                                  Math.max(lastEvent.timestamp, subscribeStart) - clockSkew * 1000
                                              ),
                                              R.map(IXO.skipWhile(ev => ev.event.id !== lastEvent.event.id)),
                                              R.map(IXO.filter(ev => ev.event.id !== lastEvent.event.id))
                                          )
                                        : subscribeFromTimestamp<E>(Math.max(now, subscribeStart) - clockSkew * 1000),
                                    R.map(s$ => IX.concat(r$, s$))
                                )
                            )
                        )
                    )
                ),
            R.flattenW
        )

const chainW =
    <A, R2, B>(f: (a: A) => R.Reader<R2, AsyncIterable<B>>) =>
    <R1>(ma: R.Reader<R1, AsyncIterable<A>>): R.Reader<R1 & R2, AsyncIterable<B>> =>
    r =>
        pipe(
            ma(r),
            IXO.flatMap(a => f(a)(r))
        )

const subscribeStream = <E extends Event>(fromPosition: ReadPosition) =>
    pipe(
        readAll<E>({ direction: BACKWARDS, fromPosition: 'END', maxCount: 1 }),
        R.map(IXO.defaultIfEmpty<MongoEvent<E> | undefined>(undefined)),
        chainW(
            flow(
                O.fromNullable,
                O.map(subscribeNonEmptyStream<E>(fromPosition)),
                O.getOrElseW(() => subscribeFromTimestamp<E>(Date.now()))
            )
        )
    )

export const subscribeToAll = <E extends Event>({ fromPosition = END, signal }: SubscribeToAllOptions = {}) => {
    return pipe(
        R.Do,
        R.chainW(() => (fromPosition === END ? startSubscribe<E>() : subscribeStream<E>(fromPosition))),
        R.map(source => IXO.wrapWithAbort(source, signal))
    )
}
