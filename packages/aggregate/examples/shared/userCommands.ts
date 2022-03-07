import { event, EventFromCreator } from '@eventsource/eventstore/Event'

export const create = (id: string, name: string) => event({
    type: 'Create',
    data: {
        id,
        name
    }
})
export type Create = EventFromCreator<typeof create>

export const changeName = (id: string, name: string) => event({
    type: 'ChangeName',
    data: {
        id,
        name
    }
})
export type ChangeName = EventFromCreator<typeof changeName>

export const remove = (id: string) => event({
    type: 'Remove',
    data: {
        id
    }
})
export type Remove = EventFromCreator<typeof remove>

export type UserCommand = Create | ChangeName | Remove
