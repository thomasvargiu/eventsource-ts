import type { Event } from '@eventsource/eventstore/Event'
import type { DeleteStreamOptions } from '@eventsource/eventstore/EventStore'
import { toError } from 'fp-ts/Either'
import * as TE from 'fp-ts/TaskEither'
import { constVoid, pipe } from 'fp-ts/function'
import type { StoreCollection } from '../EventStore'

type Dependencies<E extends Event> = {
    collection: StoreCollection<E>
}

export const deleteStream =
    <E2 extends Event>({ stream }: DeleteStreamOptions) =>
    <E extends E2>({ collection }: Dependencies<E>) =>
        pipe(
            TE.tryCatch(() => collection.deleteMany({ stream }), toError),
            TE.map(constVoid)
        )
