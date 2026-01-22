#!/usr/bin/env node

import childProcess from 'node:child_process';
import util from 'node:util';
import parseCommand from './cmd.js';
import exitUtils from './utils/exit.js';

async function main(): Promise<void> {
  try {
    process.platform === 'win32' ? await util.promisify(childProcess.exec)('chcp 65001') : undefined;
    await parseCommand();
  } catch (error) {
    console.log(error);
    exitUtils.pressAnyKeyToExit(1);
  }
}

await main();
