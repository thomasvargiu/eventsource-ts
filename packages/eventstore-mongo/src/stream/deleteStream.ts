import type { EventType } from '@eventsource/events/Event'
import { toError } from 'fp-ts/Either'
import * as TE from 'fp-ts/TaskEither'
import { constVoid, pipe } from 'fp-ts/function'
import type { Collection } from 'mongodb'
import type { StoreSchema } from '../EventStore'

type Dependencies<E extends EventType> = {
    collection: Collection<StoreSchema<E>>
}

export const deleteStream =
    (stream: string) =>
    <E extends EventType>({ collection }: Dependencies<E>) =>
        pipe(
            TE.tryCatch(() => collection.deleteMany({ streamId: stream }), toError),
            TE.map(constVoid)
        )
