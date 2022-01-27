import * as path from 'path'

export const getModulePackagePath =
    (root: string, baseDir: string) =>
    (file: string): string => {
        const parsed = path.parse(file)

        return path.join(
            root,
            path.relative(baseDir, parsed.dir),
            parsed.base === 'index.js' ? '' : parsed.name,
            'package.json'
        )
    }

export default getModulePackagePath
