import type { EventType } from '@eventsource/events/Event'
import { pipe } from 'fp-ts/function'
import type { ChangeStreamDocument, ChangeStreamOptions, Collection, Document } from 'mongodb'
import { defer, from, Observable } from 'rxjs'
import { filter, finalize } from 'rxjs/operators'
import type { StoreSchema } from '../EventStore'

type Dependencies<E extends EventType> = {
    collection: Collection<StoreSchema<E>>
}

/*
const genericSubscribe = (
    pipeline: Document = {},
    changeStreamOptions: ChangeStreamOptions = {}
) =>
    <E extends EventType>({ collection }: Dependencies<E>) => pipe(
        defer(() => pipe(
            collection.watch([
                { $match: {
                    operationType: 'insert',
                    ...pipeline,
                }},
            ], {
                batchSize: 1000,
                ...changeStreamOptions,
            }),
            cursor => pipe(
                merge(
                    fromEventPattern<ChangeStreamDocument<StoreSchema<E>>>(
                        (handler) => cursor.addListener('change', handler),
                        (handler) => cursor.removeListener('change', handler)
                    ),
                    pipe(
                        fromEventPattern<ChangeStreamDocument<StoreSchema<E>>>(
                            (handler) => cursor.addListener('error', handler),
                            (handler) => cursor.removeListener('error', handler)
                        ),
                        switchMap(throwError)
                    ),
                ),
                finalize(() => cursor.closed || cursor.close(() => {})),
                takeUntil(fromEventPattern<void>(
                    (handler) => cursor.addListener('close', handler),
                    (handler) => cursor.removeListener('close', handler)
                )),
            )
        )),
        filter((document): document is typeof document & Required<Pick<typeof document, 'fullDocument'>> => document.fullDocument !== undefined),
    )
*/

/**
 * @internal
 */
export const genericSubscribe =
    <E extends EventType>(pipeline: Document = {}, changeStreamOptions: ChangeStreamOptions = {}) =>
    ({ collection }: Dependencies<E>) =>
        pipe(
            defer(() =>
                pipe(
                    collection.watch(
                        [
                            {
                                $match: {
                                    operationType: 'insert',
                                    ...pipeline,
                                },
                            },
                        ],
                        {
                            batchSize: 1000,
                            ...changeStreamOptions,
                        }
                    ),
                    cursor =>
                        pipe(
                            from(cursor.stream()) as Observable<ChangeStreamDocument<StoreSchema<E>>>,
                            finalize(() => cursor.closed || cursor.close(() => undefined))
                        )
                )
            ),
            filter(
                (document): document is typeof document & Required<Pick<typeof document, 'fullDocument'>> =>
                    document.fullDocument !== undefined
            )
        )
