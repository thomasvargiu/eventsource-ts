module.exports = {
    plugins: ['node'],
    extends: ['./index.js', 'plugin:node/recommended'],
    parserOptions: {
        sourceType: 'module',
    },
    env: {
        node: true,
    },
    rules: {
        'node/no-unsupported-features/es-syntax': ['error', { ignores: ['modules'] }],
        'node/no-missing-import': [
            'error',
            {
                tryExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
            },
        ],
        'node/shebang': [
            'error',
            {
                convertPath: {
                    'src/**/*.ts': ['^src/(.+?)\\.ts$', 'dist/$1.js'],
                },
            },
        ],
    },
}
