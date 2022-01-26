import type { EventType } from '@eventsource/events/Event'
import type { StreamPosition, SubscribeToAllOptions } from '@eventsource/eventstore/EventStore'
import * as R from 'fp-ts/Reader'
import { flow, pipe } from 'fp-ts/function'
import { ChangeStreamOptions, Collection, Timestamp } from 'mongodb'
import { concat, defer, from, Observable } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import type { MongoEvent, StoreSchema } from '../EventStore'
import { schemaToStoreEvent } from '../internal/schemaToStoreEvent'
import { genericSubscribe } from './genericSubscribe'
import { readAll } from './readAll'

type Dependencies<E extends EventType> = {
    collection: Collection<StoreSchema<E>>
}

export type MongoSubscribeToAllOptions = SubscribeToAllOptions & {
    batchSize?: number
}

const findLastEvent =
    <E extends EventType>() =>
    ({ collection }: Dependencies<E>) =>
        pipe(
            defer(() =>
                from(
                    collection.find<{ position: string; clusterTime: Timestamp }>(
                        {},
                        {
                            sort: { position: -1 },
                            limit: 1,
                            allowDiskUse: true,
                        }
                    )
                )
            )
        )

const startSubscribe = <E extends EventType>(fromPosition?: string, options?: ChangeStreamOptions) =>
    pipe(
        R.Do,
        R.chain(() =>
            genericSubscribe<E>(
                {
                    ...(fromPosition ? { 'fullDocument.position': { $gt: fromPosition } } : {}),
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

const getPosition = (fromPosition?: StreamPosition) => {
    switch (fromPosition) {
        case 'START':
            return ''
        case 'END':
            return undefined
    }

    return fromPosition
}

export const subscribeToAll = <E extends EventType>({
    fromPosition,
    batchSize = 1000,
}: MongoSubscribeToAllOptions = {}): R.Reader<Dependencies<E>, Observable<MongoEvent<E>>> =>
    pipe(
        undefined === getPosition(fromPosition)
            ? startSubscribe<E>()
            : pipe(
                  R.ask<Dependencies<E>>(),
                  R.map(deps =>
                      defer(() =>
                          pipe(
                              findLastEvent<E>()(deps),
                              switchMap(({ position }) =>
                                  concat(
                                      readAll<E>({ fromPosition, toPosition: position, batchSize })(deps),
                                      startSubscribe<E>(position, {
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
