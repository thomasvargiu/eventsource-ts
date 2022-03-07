import type { Event } from '@eventsource/eventstore/Event'
import {
    BACKWARDS,
    FORWARDS,
    ReadAllOptions,
    ReadDirection,
    ReadPosition,
    START,
} from '@eventsource/eventstore/EventStore'
import * as O from 'fp-ts/Option'
import { pipe } from 'fp-ts/function'
import * as IX from 'ix/asynciterable'
import * as IXO from 'ix/asynciterable/operators'
import { Filter, Long } from 'mongodb'
import type { StoreCollection, StoreSchema } from '../EventStore'
import { fromReadable } from '../internal/asyncIterable/fromReadable'
import { schemaToStoreEvent } from '../internal/schemaToStoreEvent'

type Dependencies<E extends Event> = {
    collection: StoreCollection<E>
    batchSize?: number
}

const getConditions = <E extends Event>(
    fromPosition: ReadPosition,
    direction: ReadDirection
): O.Option<Readonly<Filter<StoreSchema<E>>>> => {
    if (direction === BACKWARDS) {
        switch (fromPosition) {
            case 'START':
                return O.none
            case 'END':
                return O.some({})
        }

        return O.some({
            timestamp: { $lt: Long.fromNumber(Number(fromPosition)) },
        } as Filter<StoreSchema<E>>)
    }

    switch (fromPosition) {
        case 'END':
            return O.none
        case 'START':
            return O.some({})
    }

    return O.some({ timestamp: { $gt: Long.fromNumber(Number(fromPosition)) } } as Filter<StoreSchema<E>>)
}

export const readAll =
    <E2 extends Event>({ fromPosition = START, direction = FORWARDS, maxCount, signal }: ReadAllOptions = {}) =>
    <E extends E2>({ collection, batchSize = 1000 }: Dependencies<E>) =>
        pipe(
            getConditions<E>(fromPosition, direction),
            O.map(conditions =>
                IX.defer(
                    () =>
                        pipe(
                            collection
                                .find<StoreSchema<E>>(conditions as Filter<StoreSchema<E>>, {
                                    sort: { $natural: direction === FORWARDS ? 1 : -1 },
                                    limit: maxCount,
                                    allowDiskUse: true,
                                    batchSize,
                                })
                                .stream(),
                            fromReadable
                        ) as AsyncIterable<StoreSchema<E>>
                )
            ),
            O.getOrElse(() => IX.empty() as IX.AsyncIterableX<StoreSchema<E>>),
            IXO.map(schemaToStoreEvent),
            source => IXO.wrapWithAbort(source, signal)
        )
