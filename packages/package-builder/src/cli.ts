#!/usr/bin/env node
import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'
import yargs from 'yargs'
import { fileSystem } from './FileSystem'
import { build } from './build'

yargs(process.argv.slice(2))
    .strict()
    .usage('Usage: $0 <command> [options]')
    .command(
        'build',
        'Build modules',
        {
            'dist-dir': {
                alias: 'd',
                type: 'string',
                description: 'Dist output dir',
                default: 'dist',
            },
            'lib-dir': {
                alias: 'l',
                type: 'string',
                description: 'The libary folder inside the "output-dir" folder',
                default: 'lib',
            },
            'es6-dir': {
                alias: 'e',
                type: 'string',
                description: 'The es6 libary folder inside the "output-dir" folder',
                default: 'es6',
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
        },
        async args =>
            pipe(
                fileSystem,
                build({
                    outputFolder: args['dist-dir'],
                    libFolder: args['lib-dir'],
                    es6Folder: args['es6-dir'],
                    packageFile: args['package-json'],
                    includeFiles: args['include-files'],
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
