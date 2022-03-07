import { pipe } from "fp-ts/lib/function";
import { save, load } from "../src/Aggregate";
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import * as IO from 'fp-ts/IO'
import { createUser, isActiveUser, isUninitializedUser, UserAggregate } from "./shared/User";
import { created, nameChanged, removed, UserEvent } from "./shared/userEvents";
import type * as CMD from "./shared/userCommands";

const decide = (command: CMD.UserCommand) => (aggregate: UserAggregate): RTE.ReaderTaskEither<unknown, Error, ReadonlyArray<UserEvent>> => () => {
    switch (command.type) {
        case 'Create':
            return pipe(
                aggregate,
                TE.fromPredicate(isUninitializedUser, () => new Error(`User "${command.data.id}" already exists`)),
                TE.chainIOK(() => pipe(
                    [created(command.data.id)],
                    IO.sequenceArray
                )),
            )
        case 'ChangeName':
            return pipe(
                aggregate,
                TE.fromPredicate(isActiveUser, () => new Error(`User "${command.data.id}" not found`)),
                TE.chainIOK(() => pipe(
                    [nameChanged(command.data.name)],
                    IO.sequenceArray
                )),
            )
        case 'Remove':
            return pipe(
                aggregate,
                TE.fromPredicate(isActiveUser, () => new Error(`User "${command.data.id}" not found`)),
                TE.chainIOK(() => pipe(
                    [removed()],
                    IO.sequenceArray
                )),
            )
    }

    return TE.right([])
}

export const handler = (command: CMD.UserCommand) => {
    pipe(
        load(createUser(command.data.id)),
        RTE.chainW(aggregate => pipe(
            decide(command)(aggregate),
            RTE.chain(save(aggregate)),
        ))
    )
}
