// Note: All paths are relative to the directory in which eslint is being run, rather than the directory where this file
// lives
module.exports = {
    extends: __dirname + "/packages/eslint-config/dist/node", //"@eventsource/eslint-config/node",
    root: true,
    env: {
        node: true,
    },
    ignorePatterns: [
        "coverage/**",
        "build/**",
        "dist/*",
        "esm/**",
        "examples/**",
        "node_modules/**",
        "scripts/**",
        "test/manual/**",
        ".eslintrc.js",
        ".eslintrc.cjs"
    ],
    overrides: [
        {
            files: [
                "*.ts",
                "*.tsx",
                "*.d.ts"
            ],
            parserOptions: {
                project: [
                    "tsconfig.json"
                ]
            }
        },
        {
            env: {
                node: true,
            },
            files: ['test/**/*.ts', 'test/**/*.tsx'],
            parserOptions: {
                project: ['tsconfig.test.json'],
            },
        },
    ]
}
