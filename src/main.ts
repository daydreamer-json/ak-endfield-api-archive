#!/usr/bin/env bun

import childProcess from 'node:child_process';
import util from 'node:util';
import parseCommand from './cmd.js';
import exitUtils from './utils/exit.js';
import logger from './utils/logger.js';

async function main(): Promise<void> {
  try {
    process.platform === 'win32' ? await util.promisify(childProcess.exec)('chcp 65001') : undefined;
    await parseCommand();
  } catch (error) {
    logger.error('Unhandled error in main:', error);
    exitUtils.pressAnyKeyToExit(1);
  }
}

await main();
