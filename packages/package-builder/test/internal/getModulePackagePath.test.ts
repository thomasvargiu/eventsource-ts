import { getModulePackagePath } from '../../src/internal/getModulePackagePath'

describe('getModulePackagePath', () => {
    it('should return package for file in root', () => {
        const filename = getModulePackagePath('./dist', './dist/lib')('dist/lib/File.js')

        expect(filename).toBe('dist/File/package.json')
    })

    it('should return package for index in directory', () => {
        const filename = getModulePackagePath('./dist', './dist/lib')('dist/lib/directory/index.js')

        expect(filename).toBe('dist/directory/package.json')
    })

    it('should return package for file in directory', () => {
        const filename = getModulePackagePath('./dist', './dist/lib')('dist/lib/directory/File.js')

        expect(filename).toBe('dist/directory/File/package.json')
    })
})
