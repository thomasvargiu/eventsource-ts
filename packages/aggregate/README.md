# `@eventsource/aggregate`

> Aggregate module to use with `@eventsource/eventstore`

## Install

```bash
$ npm install @eventsource/aggregate
```

## Usage

```typescript
import * as RTE from 'fp-ts/ReaderTaskEither'
import { pipe } from 'fp-ts/function'
import { Aggregate, createAggegate } from '@eventsource/aggregate/Aggregate'
import { event, EventFromCreator } from '@eventsource/eventstore/Event'
import { create as createStore } from '@eventsource/eventstore-inmemory/EventStore'

// define events
const created = (name: string) => event({
    type: 'Created',
    data: { name }
})
type Created = EventFromCreator<typeof created>

const nameChanged = (name: string) => event({
    type: 'NameChanged',
    data: { name }
})
type NameChanged = EventFromCreator<typeof nameChanged>

// UserEvent
type UserEvent = Created | NameChanged

// define aggregate data
type User = {
    name: string
}

// create the Aggregate creator with the uninitialized state
const createUser = createAggegate<User>({
    name: '',
})

// define the `apply` function
const apply = (event: UserEvent) => (user: User): User => {
    switch (event.type) {
        case 'Created':
            return {
                status: 'active',
                name: event.data.name,
            }

        case 'NameChanged':
            return {
                ...user,
                name: event.data.name,
            }
    }
}

// the handler

export const create = (id: string) => (name: string) => pipe(
    RTE.fromIO(created(name)),
    RTE.chainW(save(createUser(id)))
)

export const getUser = (id: string) => pipe(
    load(createUser(id)),
    RTE.map(O.fromPredicate(isActiveUser))
)

export const changeName = (id: string) => (name: string) => pipe(
    getUser(id),
    RTE.chainW(RTE.fromOption(() => new Error(`User "${id}" not found`))),
    RTE.chainW(aggregate => pipe(
        RTE.rightIO(nameChanged(name)),
        RTE.chain(save(aggregate))
    )),
)

// application

const store = createStore<UserEvent>()
const deps = {
    store,
    apply,
}

const userId = 'user-1'
const app = pipe(
    create(userId)('Thomas'), // create user
    RTE.chain(() => changeName(userId)('Jack')), // change user name
    RTE.chain(() => getUser(userId)) // get the user


```
