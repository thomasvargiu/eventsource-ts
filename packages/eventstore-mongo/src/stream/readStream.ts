import type { Event } from '@eventsource/eventstore/Event'
import {
    FORWARDS,
    ReadFromStreamOptions,
    ReadRevision,
    ReadDirection,
    START,
    BACKWARDS,
    END,
} from '@eventsource/eventstore/EventStore'
import { StreamNotFoundError } from '@eventsource/eventstore/errors'
import * as O from 'fp-ts/Option'
import { pipe } from 'fp-ts/function'
import * as IX from 'ix/asynciterable'
import * as IXO from 'ix/asynciterable/operators'
import { Filter, FindCursor, FindOptions, Long } from 'mongodb'
import type { MongoEvent, StoreSchema } from '../EventStore'
import { fromReadable } from '../internal/asyncIterable/fromReadable'
import { schemaToStoreEvent } from '../internal/schemaToStoreEvent'

type Dependencies<E extends Event, S extends StoreSchema<E> = StoreSchema<E>> = {
    collection: {
        find: (filter: Filter<S>, options?: FindOptions) => FindCursor<StoreSchema<E>>
    }
    batchSize?: number
}

const getConditions = (fromRevision: ReadRevision, direction: ReadDirection) => {
    if (direction === BACKWARDS) {
        switch (fromRevision) {
            case START:
                return O.none
            case END:
                return O.some({})
        }

        return O.some({ revision: { $lt: Long.fromBigInt(fromRevision) } })
    }

    switch (fromRevision) {
        case END:
            return O.none
        case START:
            return O.some({})
    }

    return O.some({ revision: { $gt: Long.fromBigInt(fromRevision) } })
}

const checkStreamOnEmpty =
    <E2 extends Event>(
        stream: string,
        { fromRevision, direction }: { fromRevision: ReadRevision; direction: ReadDirection }
    ) =>
    <E extends E2>(deps: Dependencies<E>): IX.AsyncIterableX<MongoEvent<E>> =>
        ((fromRevision === START || fromRevision === BigInt(-1)) && direction === FORWARDS) ||
        (fromRevision === END && direction === BACKWARDS)
            ? IX.throwError(new StreamNotFoundError(stream))
            : pipe(
                  IX.defer(() =>
                      fromReadable<StoreSchema<E>>(
                          deps.collection
                              .find({ stream } as Filter<StoreSchema<E>>, {
                                  sort: { stream: 1, revision: 1 },
                                  projection: { stream: 1 },
                                  limit: 1,
                                  allowDiskUse: true,
                              })
                              .stream()
                      )
                  ),
                  IXO.defaultIfEmpty<StoreSchema<E> | false>(false as const),
                  IXO.flatMap(item =>
                      item === false
                          ? IX.throwError(new StreamNotFoundError(stream))
                          : (IX.empty() as AsyncIterable<MongoEvent<E>>)
                  ),
                  IXO.take(1)
              )

export const readStream =
    <E2 extends Event>({
        stream,
        fromRevision = START,
        direction = FORWARDS,
        maxCount,
        signal,
    }: ReadFromStreamOptions) =>
    <E extends E2>({ collection, batchSize = 1000 }: Dependencies<E>): AsyncIterable<MongoEvent<E>> =>
        pipe(
            getConditions(fromRevision, direction),
            O.map(conditions =>
                pipe(
                    IX.defer(() =>
                        fromReadable<StoreSchema<E>>(
                            collection
                                .find({ stream, ...conditions } as Filter<StoreSchema<E>>, {
                                    sort: { stream: 1, revision: direction === FORWARDS ? 1 : -1 },
                                    limit: maxCount || undefined,
                                    allowDiskUse: true,
                                    batchSize,
                                })
                                .stream()
                        )
                    ),
                    IXO.map(schemaToStoreEvent),
                    IXO.defaultIfEmpty<false | MongoEvent<E>>(false as const),
                    IXO.flatMap(res =>
                        res === false
                            ? checkStreamOnEmpty<E>(stream, { fromRevision, direction })({ collection })
                            : IX.of(res)
                    )
                )
            ),
            O.getOrElse(() => checkStreamOnEmpty<E>(stream, { fromRevision, direction })({ collection })),
            source => IXO.wrapWithAbort(source, signal)
        )
