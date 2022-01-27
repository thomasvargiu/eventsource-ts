import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'
import * as path from 'path'
import type { FileSystem } from './FileSystem'
import getRelativePath from './getRelativePath'

export const getPackageForFile = (filePath: string, isEsm: boolean) => (file: string) => (C: FileSystem) => {
    const base = path.dirname(filePath)
    const content = {
        main: getRelativePath(base, file),
        ...(isEsm ? { module: getRelativePath(base, file) } : {}),
        types: getRelativePath(base, file, '.d.ts'),
        sideEffects: false,
    }

    return pipe(
        C.isFile(filePath),
        TE.chain(exists => (exists ? pipe(C.readFile(filePath), TE.map(JSON.parse)) : TE.of({}))),
        TE.map((packageContent: Record<string, unknown>) => ({
            ...content,
            ...packageContent,
        }))
    )
}

export default getPackageForFile
