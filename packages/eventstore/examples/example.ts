import { event, Event, EventFromCreator } from '../src/Event'
import { BACKWARDS, END, EventStore, NO_STREAM, START, SubscribableEventStore } from '../src/EventStore'
import * as TE from 'fp-ts/TaskEither'
import * as E from 'fp-ts/Either'
import { pipe, tuple } from 'fp-ts/lib/function';

declare const store: EventStore<Event>

/**
 * Create an Event creator.
 * The function `event()` returns an `IO<Event>`.
 */
const created = (name: string) => event({
    type: 'Created',
    data: {
        name
    }
})
type CreatedEvent = EventFromCreator<typeof created>

/**
 * We can even provide metadata
 */
const updated = (name: string, correlationId?: string) => event({
    type: 'Updated',
    data: {
        name
    },
    metadata: {
        correlationId
    }
})

const updatedEvent = updated('foo', 'event-3')(); // it's an `IO`, so we call it (just for the example)
// the event has fou properties
updatedEvent.id; // a unique UUID
updatedEvent.type; // `updated`
updatedEvent.data; // `{ name: 'foo' }`
updatedEvent.metadata // `{ correlationId: 'event-3' }`

/**
 * Append an event to a new stream, use `expectedRevision: NO_STREAM` to ensure the stream does not exists.
 * Then retrieve the current revision.
 */
pipe(
    TE.rightIO(event({ type: 'Created' })),
    TE.chain(store.appendToStream({ stream: 'user-1', expectedRevision: NO_STREAM })),
    TE.map(({ revision }) => revision)  // retrieve the current revision
)

/**
 * We can append an event using a provided `expectedRevision` to ensure the integrity of the stream log.
 * The `expectedRevision` revision can be retrieved from a previous `appendToStream()` or a `readStream()` call.
 */
pipe(
    TE.rightIO(event({ type: 'Updated' })),
    TE.chain(store.appendToStream({ stream: 'user-1', expectedRevision: BigInt(1) })),
)

/**
 * Read a stream.
 * The result is an `AsyncIterable`. We can obtain an array iterating it.
 */
pipe(
    store.readStream({ stream: 'user-1' }),
    stream => TE.tryCatch(async () => {
        const events = []
        let revision = BigInt(-1)
        for await (const ev of stream) {
            events.push(ev)
            revision = ev.revision
        }

        return tuple(revision, events)
    }, E.toError),
    TE.map(([curentRevision, events]) => {
        // ...
    })
)

/**
 * Read a stream from a specific revision.
 * Events after the provided evision are returned.
 */
store.readStream({ stream: 'user-1', fromRevision: BigInt(1) })

 /**
 * Read a stream in reverse order.
 */
store.readStream({ stream: 'user-1', direction: BACKWARDS })

/**
 * Get the last stream event.
 * We can use the `maxCount` option to limit results.
 */
store.readStream({ stream: 'user-1', fromRevision: END, direction: BACKWARDS, maxCount: 1 })

/**
 * We can delete a stream, deleting all stream events
 */
store.deleteStream({ stream: 'user-1' })

/**
 * Read all the events from the eventstore
 * Get
 */
pipe(
    store.readAll(),
    stream => TE.tryCatch(async () => {
        const events = []
        let position = undefined
        for await (const ev of stream) {
            events.push(ev)
            position = ev.position
        }

        return tuple(position, events)
    }, E.toError),
    TE.map(([curentPosition, events]) => {
        // ...
    })
);

/**
 * Read all the events from the eventstore starting from a specific position.
 * The position can be retrieved from a previous `readAll()` call.
 */
store.readAll({ fromPosition: 'position' })

/**
 * We can use `direction` and `maxCount` like the `readStream()` method
 */
store.readAll({
    fromPosition: 'position',
    direction: BACKWARDS,
    maxCount: 1
})

declare const subscribableStore: SubscribableEventStore<Event>;

/**
 * Live subscription to stream
 */
pipe(
    subscribableStore.subscribe({ stream: 'user-1' }),
    async (stream) => {
        for await (const ev of stream) {
            // do something with the event
            // await process(ev)
        }
    }
)

/**
 * Catch-Up subscription to stream from start.
 * We can open a catch-up subscription, reading all the stream events and opening a subscription
 */
subscribableStore.subscribe({ stream: 'user-1', fromRevision: START })

/**
 * Catch-Up subscription to stream from revision.
 */
subscribableStore.subscribe({ stream: 'user-1', fromRevision: BigInt(2) })

/**
 * Live subscription to all streams.
 * We can save the position of the last processed event in order to start
 * another subscription from that position lateer (see below).
 */
 pipe(
    subscribableStore.subscribeToAll(),
     async (stream) => {
        let lastPosition
        for await (const ev of stream) {
            // do something with the event
            // await process(ev)
            lastPosition = ev.position
        }
    }
)

/**
 * Catch-Up subscription to all streams from start.
 * We can open a catch-up subscription, reading all the stream events and opening a subscription
 */
subscribableStore.subscribeToAll({ fromPosition: START })

/**
 * Catch-Up subscription to all streams from position.
 */
subscribableStore.subscribeToAll({ fromPosition: 'last-position' })
