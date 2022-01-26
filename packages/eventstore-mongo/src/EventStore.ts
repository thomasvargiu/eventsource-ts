import type { EventData, EventType } from '@eventsource/events/Event'
import type { StoreAllEvent, StoreEvent, SubscribableEventStore } from '@eventsource/eventstore/EventStore'
import type { Reader } from 'fp-ts/Reader'
import type { TaskEither } from 'fp-ts/TaskEither'
import type { Collection, MongoClient, Long } from 'mongodb'
import type { Observable } from 'rxjs'
import { appendToStream } from './stream/appendToStream'
import { deleteStream } from './stream/deleteStream'
import { readAll } from './stream/readAll'
import { readFromStream } from './stream/readFromStream'
import { subscribe } from './stream/subscribe'
import { MongoSubscribeToAllOptions, subscribeToAll } from './stream/subscribeToAll'
export { createCollection as createCollectionIfNotExists } from './createCollection'

export type MongoEvent<E extends EventType = EventType> = StoreEvent<E> & {
    position: string
}

export type MongoAllEvent<E extends EventType = EventType> = StoreAllEvent<MongoEvent<E>>

export type StoreSchema<E extends EventType = EventType> = EventData<E> & {
    streamId: string
    timestamp: Long
    revision: Long
    position: string
}

export type StoreCollection<E extends EventType = EventType> = Collection<StoreSchema<E>>

export type Dependencies<E extends EventType = EventType> = {
    client: MongoClient
    collection: Collection<StoreSchema<E>>
}

export type MongoEventStore<E extends EventType> = SubscribableEventStore<E, MongoEvent<E>, MongoAllEvent<E>> & {
    deleteStream: (stream: string) => TaskEither<Error, void>
    subscribeToAll: (options?: MongoSubscribeToAllOptions) => Observable<MongoEvent<E> & { position: string }>
}

const reverseReader =
    <A extends readonly unknown[], B, R>(func: (...a: A) => Reader<R, B>): Reader<R, (...a: A) => B> =>
    (r: R) =>
    (...a: A) =>
        func(...a)(r)

export const create = <E extends EventType>(dependencies: Dependencies<E>): MongoEventStore<E> => ({
    appendToStream: reverseReader(appendToStream)(dependencies),
    readFromStream: reverseReader(readFromStream)(dependencies),
    deleteStream: reverseReader(deleteStream)(dependencies),
    subscribe: reverseReader(subscribe)(dependencies),
    readAll: reverseReader(readAll)(dependencies),
    subscribeToAll: reverseReader(subscribeToAll)(dependencies),
})
