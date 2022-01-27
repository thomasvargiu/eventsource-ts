import { getRelativePath } from '../../src/internal/getRelativePath'

describe('getRelativePath', () => {
    it('should resolve relative path', () => {
        expect(getRelativePath('./dist/foo', './dist/bar/foo.ts')).toBe('../bar/foo.ts')
    })

    it('should change extension', () => {
        expect(getRelativePath('./dist/foo', './dist/bar/foo.ts', '.d.ts')).toBe('../bar/foo.d.ts')
    })
})
