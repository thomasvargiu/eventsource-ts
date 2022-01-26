import type { EventType } from '@eventsource/events/Event'
import type { SubscribeOptions } from '@eventsource/eventstore/EventStore'
import * as R from 'fp-ts/Reader'
import { flow, pipe } from 'fp-ts/function'
import { ChangeStreamOptions, Collection, Long, Timestamp } from 'mongodb'
import { concat, defer, Observable } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import type { MongoEvent, StoreSchema } from '../EventStore'
import { schemaToStoreEvent } from '../internal/schemaToStoreEvent'
import { taskEitherToObservable } from '../internal/taskToObservable'
import { genericSubscribe } from './genericSubscribe'
import { getStreamRevision } from './getStreamRevision'
import { readFromStream } from './readFromStream'

type Dependencies<E extends EventType> = {
    collection: Collection<StoreSchema<E>>
}

export type MongoSubscribeOptions = SubscribeOptions & {
    batchSize?: number
}

const startSubscribe = <E extends EventType>(
    streamId: string,
    currentRevision?: bigint,
    options?: ChangeStreamOptions
) =>
    pipe(
        R.Do,
        R.chain(() =>
            genericSubscribe<E>(
                {
                    'fullDocument.streamId': streamId,
                    ...(currentRevision ? { 'fullDocument.revision': { $gt: Long.fromBigInt(currentRevision) } } : {}),
                },
                options
            )
        ),
        R.map(
            flow(
                map(({ fullDocument }) => fullDocument),
                map(schemaToStoreEvent)
            )
        )
    )

export const subscribe = <E extends EventType>(
    stream: string,
    { fromRevision, batchSize = 1000 }: MongoSubscribeOptions = {}
): R.Reader<Dependencies<E>, Observable<MongoEvent<E>>> =>
    pipe(
        undefined === fromRevision
            ? startSubscribe<E>(stream)
            : pipe(
                  R.ask<Dependencies<E>>(),
                  R.map(deps =>
                      defer(() =>
                          pipe(
                              getStreamRevision(stream)(deps),
                              taskEitherToObservable,
                              switchMap(currentRevision =>
                                  concat(
                                      readFromStream<E>(stream, {
                                          fromRevision,
                                          toRevision: currentRevision,
                                          batchSize,
                                      })(deps),
                                      startSubscribe<E>(stream, currentRevision, {
                                          batchSize,
                                          startAtOperationTime: new Timestamp({ t: Date.now() / 1000 - 60, i: 0 }),
                                      })(deps)
                                  )
                              )
                          )
                      )
                  )
              )
    )
