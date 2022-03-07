import { pipe } from "fp-ts/function";
import { save, load } from "../src/Aggregate";
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as O from 'fp-ts/Option'
import { createUser, isActiveUser } from "./shared/User";
import { created, nameChanged, removed } from "./shared/userEvents";

export const create = (id: string) => (name: string) => pipe(
    RTE.rightIO(created(name)),
    RTE.chain(save(createUser(id)))
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

export const remove = (id: string) => pipe(
    getUser(id),
    RTE.chainW(RTE.fromOption(() => new Error(`User "${id}" not found`))),
    RTE.chainW(aggregate => pipe(
        RTE.rightIO(removed()),
        RTE.chain(save(aggregate))
    )),
)
