import type { Event } from '@eventsource/eventstore/Event'
import type { SubscribableEventStore, StoreAllEvent } from '@eventsource/eventstore/EventStore'
import type { MongoClient, Long, Collection } from 'mongodb'
import { createCollection as createCollectionFunc } from './createCollection'
import { appendToStream } from './stream/appendToStream'
import { deleteStream } from './stream/deleteStream'
import { readAll } from './stream/readAll'
import { readStream } from './stream/readStream'
import { subscribe } from './stream/subscribe'
import { subscribeToAll } from './stream/subscribeToAll'

export const createCollection = createCollectionFunc

/**
 * @deprecated Use `createCollection()`
 */
export const createCollectionIfNotExists = createCollection

export type MongoEvent<E extends Event = Event> = StoreAllEvent<E>

export type StoreSchema<E extends Event = Event> = {
    id: E['id']
    type: E['type']
    data: E['data']
    metadata: E['metadata']
    stream: string
    timestamp: Long
    revision: Long
}

export type StoreCollection<E extends Event> = Collection<StoreSchema<E>>

export type Dependencies<E extends Event = Event> = {
    client: MongoClient
    collection: Collection<StoreSchema<E>>
    clockSkew?: number
    batchSize?: number
    /**
     * Used on subscribeToAll, is the minimum timestamp (ms) from read on
     */
    subscribeStart?: number
}

export const create = <E extends Event = Event>(dependencies: Dependencies<E>): SubscribableEventStore<E> => ({
    readStream: options => readStream<E>(options)(dependencies),
    readAll: options => readAll<E>(options)(dependencies),
    appendToStream: options => events => appendToStream<E>(options)(events)(dependencies),
    deleteStream: options => deleteStream<E>(options)(dependencies),
    subscribe: options => subscribe<E>(options)(dependencies),
    subscribeToAll: options => subscribeToAll<E>(options)(dependencies),
})
