import * as E from 'fp-ts/Either'
import * as J from 'fp-ts/Json'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'
import * as path from 'path'
import { fileSystem, FileSystem } from './FileSystem'

type Options = {
    outputFolder: string
    libFolder: string
    es6Folder?: string
    packageFile: string
    includeFiles: string[]
}

const defaultOptions = {
    outputFolder: 'dist',
    libFolder: 'lib',
    es6Folder: 'es6',
    packageFile: 'package.json',
    includeFiles: [],
}

const fsExists = (dir: string) => (C: FileSystem) =>
    pipe(
        C.stat(dir),
        TE.match(
            () => false,
            () => true
        ),
        TE.fromTask
    )

const checkOptions =
    (options: Options = defaultOptions) =>
    (C: FileSystem) =>
        pipe(
            options.es6Folder !== undefined
                ? pipe(
                      C.stat(`${options.outputFolder}/${options.es6Folder}`),
                      TE.match(
                          () => undefined,
                          () => options.es6Folder
                      )
                  )
                : T.of(options.es6Folder),
            T.map(es6Folder => ({
                ...options,
                es6Folder,
            })),
            T.map(E.right)
        )

const copyPackageJson =
    ({ outputFolder, packageFile }: Options) =>
    (C: FileSystem) =>
        pipe(
            TE.Do,
            TE.chain(() => C.readFile(packageFile)),
            TE.chain(s => TE.fromEither(pipe(J.parse(s), E.mapLeft(E.toError)))),
            TE.map(json => {
                const clone = Object.assign({}, json as any)

                delete clone.scripts
                delete clone.files
                delete clone.devDependencies

                return clone
            }),

            TE.chain(json => C.writeFile(path.join(outputFolder, packageFile), JSON.stringify(json, null, 2)))
        )

const FILES: ReadonlyArray<string> = ['CHANGELOG.md', 'LICENSE', 'README.md']

const copyFiles =
    ({ includeFiles, outputFolder }: Options) =>
    (C: FileSystem) =>
        pipe(
            [...FILES, ...includeFiles],
            TE.traverseReadonlyArrayWithIndex((_, from) =>
                pipe(
                    fsExists(from)(C),
                    TE.chain(exists => (exists ? C.copyFile(from, path.resolve(outputFolder, from)) : TE.of(undefined)))
                )
            )
        )

const makeModules =
    (options: Options) =>
    (C: FileSystem): TE.TaskEither<Error, void> => {
        return pipe(
            TE.of(options),
            TE.map(makeSingleModule(C)),
            TE.chain(makeSingleModuleC =>
                pipe(
                    fileSystem.glob(`${options.outputFolder}/${options.libFolder}/*.js`),
                    TE.map(getModules),
                    TE.chain(TE.traverseReadonlyArrayWithIndex((_, a) => makeSingleModuleC(a))),
                    TE.map(() => undefined)
                )
            )
        )
    }

function getModules(paths: ReadonlyArray<string>): ReadonlyArray<string> {
    return paths.map(filePath => path.basename(filePath, '.js')).filter(x => x !== 'index')
}

function makeSingleModule(C: FileSystem): (options: Options) => (module: string) => TE.TaskEither<Error, void> {
    return options => m =>
        pipe(
            C.mkdir(path.join(options.outputFolder, m)),
            TE.chain(() => makePkgJson(m, options)),
            TE.chain(data => C.writeFile(path.join(options.outputFolder, m, 'package.json'), data))
        )
}

function makePkgJson(module: string, options: Options): TE.TaskEither<Error, string> {
    return pipe(
        JSON.stringify(
            {
                main: `../${options.libFolder}/${module}.js`,
                ...(options.es6Folder ? { module: `../${options.es6Folder}/${module}.js` } : {}),
                typings: `../${options.libFolder}/${module}.d.ts`,
                sideEffects: false,
            },
            null,
            2
        ),
        TE.right
    )
}

export const build = (options: Options = defaultOptions) =>
    pipe(
        checkOptions(options),
        RTE.chain(opts =>
            pipe(
                RTE.Do,
                RTE.chain(() => makeModules(opts)),
                RTE.chain(() => copyPackageJson(opts)),
                RTE.chain(() => copyFiles(opts))
            )
        )
    )
