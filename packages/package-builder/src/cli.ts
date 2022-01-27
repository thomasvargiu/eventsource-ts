#!/usr/bin/env node
import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'
import yargs from 'yargs'
import { build } from './build'
import { fileSystem } from './internal/FileSystem'

yargs(process.argv.slice(2))
    .strict()
    .usage('Usage: $0 <command> [options]')
    .command(
        'build',
        'Build modules',
        {
            'out-dir': {
                alias: 'd',
                type: 'string',
                description: 'Output dir',
                default: 'dist',
            },
            'lib-dir': {
                alias: 'l',
                type: 'string',
                description: 'The libary folder inside the "out-dir" folder',
                default: 'lib',
            },
            'esm-dir': {
                alias: 'e',
                type: 'string',
                description: 'The es6 libary folder inside the "out-dir" folder',
                default: 'esm',
            },
            'package-json': {
                type: 'string',
                description: 'The package.json to copy',
                default: 'package.json',
            },
            'include-files': {
                alias: 'i',
                type: 'array',
                description: 'Files to copy',
                default: [],
            },
            exclude: {
                alias: 'p',
                type: 'array',
                description: 'Exclude pattern',
                default: [],
            },
        },
        async args =>
            pipe(
                fileSystem,
                build({
                    outputFolder: args['out-dir'],
                    libFolder: args['lib-dir'],
                    esmFolder: args['esm-dir'],
                    packageFile: args['package-json'],
                    includeFiles: args['include-files'],
                    exclude: args.exclude,
                }),
                TE.match(
                    error => {
                        throw error
                    },
                    () => undefined
                )
            )()
    )
    .demandCommand()
    .alias({ h: 'help' })
    .help('h').argv
