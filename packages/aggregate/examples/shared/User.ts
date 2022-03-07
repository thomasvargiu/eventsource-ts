import { Aggregate, createAggegate } from '../../src/Aggregate'
import type { UserEvent } from './userEvents';

type UserStatus = 'uninitialized' | 'active' |  'removed'
type BaseUser = {
    status: UserStatus
    name: string
}

export type UninitializedUser = BaseUser & {
    status: 'uninitialized',
}
export type ActiveUser = BaseUser & {
    status: 'active'
}
export type RemovedUser = BaseUser & {
    status: 'removed'
}

export type User = UninitializedUser | ActiveUser | RemovedUser
export type UserAggregate<A extends User = User> = Aggregate<A>

export const isUninitializedUser = (user: UserAggregate): user is UserAggregate<UninitializedUser> => user.data.status === 'uninitialized'
export const isActiveUser = (user: UserAggregate): user is UserAggregate<ActiveUser> => user.data !== null && user.data.status === 'active'
export const isRemovedUser = (user: UserAggregate): user is UserAggregate<RemovedUser> => user.data !== null && user.data.status === 'removed'

export const createUser = createAggegate<User>({
    status: 'uninitialized',
    name: '',
})

export const apply = (event: UserEvent) => (user: User): User => {
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

        case 'Removed':
            return {
                ...user,
                status: 'removed'
            }
    }
}
