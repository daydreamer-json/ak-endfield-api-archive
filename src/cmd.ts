import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import cmds from './cmds.js';
import * as TypesLogLevels from './types/LogLevels.js';
import argvUtils from './utils/argv.js';
import appConfig from './utils/config.js';
import configEmbed from './utils/configEmbed.js';
import exitUtils from './utils/exit.js';
import logger from './utils/logger.js';

if (configEmbed.VERSION_NUMBER === null) throw new Error('Embed VERSION_NUMBER is null');

function wrapHandler(handler: (argv: any) => Promise<void>) {
  return async (argv: any) => {
    try {
      await handler(argv);
      await exitUtils.exit(0);
    } catch (error) {
      logger.error('Error caught:', error);
      await exitUtils.exit(1);
    }
  };
}

async function parseCommand() {
  const yargsInstance = yargs(hideBin(process.argv));
  await yargsInstance
    .command(
      ['test'],
      'Test command',
      (yargs) => {
        yargs.options({
          'output-dir': {
            alias: ['o'],
            desc: 'Output root directory',
            default: path.resolve('output'),
            normalize: true,
            type: 'string',
          },
        });
      },
      wrapHandler(cmds.test),
    )
    .options({
      'log-level': {
        desc: 'Set log level (' + TypesLogLevels.LOG_LEVELS_NUM.join(', ') + ')',
        default: appConfig.logger.logLevel,
        type: 'number',
        coerce: (arg: number): TypesLogLevels.LogLevelString => {
          if (arg < TypesLogLevels.LOG_LEVELS_NUM[0] || arg > TypesLogLevels.LOG_LEVELS_NUM.slice(-1)[0]!) {
            throw new Error(`Invalid log level: ${arg} (Expected: ${TypesLogLevels.LOG_LEVELS_NUM.join(', ')})`);
          } else {
            return TypesLogLevels.LOG_LEVELS[arg as TypesLogLevels.LogLevelNumber];
          }
        },
      },
    })
    .middleware(async (argv) => {
      argvUtils.setArgv(argv);
      logger.level = argvUtils.getArgv()['logLevel'];
      logger.trace('Process started: ' + `${configEmbed.APPLICATION_NAME} v${configEmbed.VERSION_NUMBER}`);
    })
    .scriptName(configEmbed.APPLICATION_NAME)
    .version(String(configEmbed.VERSION_NUMBER))
    .usage('$0 <command> [argument] [option]')
    .help()
    .alias('help', 'h')
    .alias('help', '?')
    .alias('version', 'V')
    .demandCommand(1)
    .strict()
    .recommendCommands()
    .parse();
}

export default parseCommand;
