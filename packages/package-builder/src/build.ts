import { readonlyArray } from 'fp-ts'
import * as E from 'fp-ts/Either'
import { eqStrict } from 'fp-ts/Eq'
import * as J from 'fp-ts/Json'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { flow, pipe } from 'fp-ts/function'
import * as path from 'path'
import { fileSystem, FileSystem } from './internal/FileSystem'
import getModulePackagePath from './internal/getModulePackagePath'
import getPackageForFile from './internal/getPackageForFile'

type Options = {
    outputFolder: string
    libFolder: string
    esmFolder?: string
    packageFile: string
    includeFiles: string[]
    exclude: string[]
}

const defaultOptions = {
    outputFolder: 'dist',
    libFolder: 'lib',
    esmFolder: 'es6',
    packageFile: 'package.json',
    includeFiles: [],
    exclude: [],
}

const checkOptions =
    (options: Options = defaultOptions) =>
    (C: FileSystem) =>
        pipe(
            options.esmFolder !== undefined
                ? pipe(
                      C.exists(`${options.outputFolder}/${options.esmFolder}`),
                      TE.match(
                          () => undefined,
                          () => options.esmFolder
                      )
                  )
                : T.of(options.esmFolder),
            T.map(esmFolder => ({
                ...options,
                esmFolder,
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
                    C.exists(from),
                    TE.chain(exists => (exists ? C.copyFile(from, path.resolve(outputFolder, from)) : TE.of(undefined)))
                )
            )
        )

const makeModules =
    (outDir: string, libDir: string, excludePatterns: ReadonlyArray<string>, isEsm: boolean) =>
    (C: FileSystem): TE.TaskEither<Error, void> => {
        return pipe(
            TE.of(getModulePackagePath(outDir, libDir)),
            TE.chain(getModulePackage =>
                pipe(
                    fileSystem.glob(`${libDir}/**/*.js`),
                    TE.chain(files =>
                        pipe(
                            excludePatterns,
                            TE.traverseArray(pattern => fileSystem.glob(`${libDir}/${pattern}`)),
                            TE.map(
                                flow(
                                    readonlyArray.flatten,
                                    exclude => readonlyArray.difference<string>(eqStrict)(files, exclude),
                                    readonlyArray.filter(file => file !== path.join(`${libDir}`, 'index.js'))
                                )
                            )
                        )
                    ),
                    TE.chain(
                        TE.traverseReadonlyArrayWithIndex((_, file) =>
                            pipe(
                                TE.of(getModulePackage(file)),
                                TE.chain(packagefile => makeModuleForFile(packagefile, file, isEsm)(C))
                            )
                        )
                    ),
                    TE.map(() => undefined)
                )
            )
        )
    }

const makeModuleForFile = (packageFile: string, file: string, isEsm: boolean) => (C: FileSystem) =>
    pipe(
        getPackageForFile(packageFile, isEsm)(file)(C),
        TE.chainW(content => pipe(JSON.stringify(content, null, 2), TE.right)),
        TE.chainFirst(() => C.mkdir(path.dirname(packageFile), { recursive: true })),
        TE.chain(content => C.writeFile(packageFile, content))
    )

export const build = (options: Options = defaultOptions) =>
    pipe(
        checkOptions(options),
        RTE.chain(opts =>
            pipe(
                RTE.Do,
                RTE.chain(() =>
                    makeModules(
                        opts.outputFolder,
                        path.join(opts.outputFolder, opts.libFolder),
                        opts.exclude,
                        opts.libFolder === opts.esmFolder
                    )
                ),
                RTE.chain(() =>
                    opts.esmFolder !== undefined && opts.libFolder !== opts.esmFolder
                        ? makeModules(
                              opts.outputFolder,
                              path.join(opts.outputFolder, opts.esmFolder),
                              opts.exclude,
                              true
                          )
                        : RTE.right(undefined)
                ),
                RTE.chain(() => copyPackageJson(opts)),
                RTE.chain(() => copyFiles(opts))
            )
        )
    )
