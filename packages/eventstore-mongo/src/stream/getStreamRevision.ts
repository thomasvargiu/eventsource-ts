import type { EventType } from '@eventsource/events/Event'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import { constant, flow, pipe } from 'fp-ts/function'
import type { Collection } from 'mongodb'
import type { StoreSchema } from '../EventStore'

type Dependencies<E extends EventType> = {
    collection: Collection<StoreSchema<E>>
}

export const getStreamRevision =
    <E extends EventType>(stream: string) =>
    ({ collection }: Dependencies<E>) =>
        pipe(
            TE.tryCatch(
                () =>
                    collection
                        .find<Pick<StoreSchema<E>, 'revision'>>(
                            { streamId: stream },
                            {
                                limit: 1,
                                sort: { streamId: 1, revision: -1 },
                                projection: { _id: 0, revision: 1 },
                                allowDiskUse: true,
                            }
                        )
                        .toArray(),
                E.toError
            ),
            TE.map(
                flow(
                    A.head,
                    O.map(({ revision }) => BigInt(revision.toString())),
                    O.getOrElse(constant(BigInt(-1)))
                )
            )
        )
