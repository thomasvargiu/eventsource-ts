import type { Event } from '@eventsource/eventstore/Event'
import { END, ReadRevision, SubscribeOptions } from '@eventsource/eventstore/EventStore'
import * as R from 'fp-ts/Reader'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { flow, identity, pipe } from 'fp-ts/function'
import * as IX from 'ix/asynciterable'
import * as IXO from 'ix/asynciterable/operators'
import { ChangeStreamOptions, Long } from 'mongodb'
import type { MongoEvent } from '../EventStore'
import { timestampFromMs } from '../internal/Timestamp'
import { schemaToStoreEvent } from '../internal/schemaToStoreEvent'
import { genericSubscribe } from './genericSubscribe'
import { getStreamRevision } from './getStreamRevision'
import { readStream } from './readStream'

const startSubscribe = <E extends Event>(stream: string, currentRevision?: bigint, options?: ChangeStreamOptions) =>
    pipe(
        genericSubscribe<E>(
            {
                'fullDocument.stream': stream,
                ...(currentRevision ? { 'fullDocument.revision': { $gt: Long.fromBigInt(currentRevision) } } : {}),
            },
            options
        ),
        R.map(
            flow(
                IXO.map(({ fullDocument }) => fullDocument),
                IXO.map(schemaToStoreEvent)
            )
        )
    )

const startSubscribeFrom = <E extends Event>(stream: string, revision: bigint) =>
    pipe(
        ({ clockSkew = 60 } = {}) =>
            startSubscribe<E>(stream, revision, {
                startAtOperationTime: timestampFromMs(Date.now() - clockSkew * 1000),
            }),
        R.flattenW
    )

const readFromStream = <E extends Event>(stream: string, fromRevision: ReadRevision, currentRevision: bigint) =>
    pipe(
        readStream<E>({ stream, fromRevision }), //
        R.map(IXO.filter<MongoEvent<E>>(event => event.revision <= currentRevision))
    )

const startSubscriber = <E extends Event>(stream: string, fromRevision: ReadRevision, currentRevision: bigint) =>
    pipe(
        R.Do,
        R.bindW('o2$', () => startSubscribeFrom<E>(stream, currentRevision)),
        R.bindW('o1$', () => readFromStream<E>(stream, fromRevision, currentRevision)),
        R.map(({ o1$, o2$ }) => IX.concat(o1$, o2$))
    )

export const subscribe = <E extends Event>({ stream, fromRevision = END, signal }: SubscribeOptions) =>
    pipe(
        fromRevision === END
            ? startSubscribe<E>(stream)
            : pipe(
                  getStreamRevision<E>(stream),
                  RTE.chainReaderKW(currentRevision => startSubscriber<E>(stream, fromRevision, currentRevision)),
                  R.map(TE.match(IX.throwError, identity)),
                  R.map(IX.defer)
              ),
        R.map(source => IXO.wrapWithAbort(source, signal))
    )
