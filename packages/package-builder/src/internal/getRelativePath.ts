import * as path from 'path'

export const getRelativePath = (from: string, to: string, extension?: string) => {
    return extension === undefined
        ? path.relative(from, to)
        : path.relative(from, `${path.join(path.dirname(to), path.parse(to).name)}${extension}`)
}

export default getRelativePath
