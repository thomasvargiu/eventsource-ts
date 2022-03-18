# `@eventsource/eventstore-mongo`

> `@eventsource/eventstore` implementation for MongoDB.

## Install

```bash
$ npm install @eventsource/eventstore-mongo
```

## Usage

Read the [`@eventsource/eventstore`](https://www.npmjs.com/package/@eventsource/eventstore) documentation.

`@eventsource/eventstore-mongo` requires a connection to a MongoDB replica set or cluster in order to use
transactions (to append multiple events) and subscribtions using MongoDB change streams.

```typescript
import { create, createCollection, StoreSchema } from '@eventsource/eventstore-mongo/EventStore'
import type { Event } from '@eventsource/eventstore/Event'
import { MongoClient } from 'mongodb'
import * as TE from 'fp-ts/TaskEither'
import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'

type StoreEvent = Event // define your event type
const storeName = 'store'

const client = new MongoClient(
    'mongodb://localhost:27017/eventstore?replicaSet=rs0&writeConcern=majority',
)

const connect = (client: MongoClient) => TE.tryCatch(() => client.connect(), E.toError)

const createStore = (client: MongoClient) => pipe(
    TE.of({
        client,
        db: client.db('eventstore'),
    }),
    // create collection and indexes if the collection does not exists
    TE.bind('collection', () => createCollection<StoreSchema<StoreEvent>>(storeName)({ db })),
    TE.chain(create)
)

const app = pipe(
    connect(client),
    TE.chain(createStore)
)
```
