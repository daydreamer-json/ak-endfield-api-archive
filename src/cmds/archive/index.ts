import { Archiver } from './Archiver.js';

async function mainCmdHandler() {
  const archiver = new Archiver();
  await archiver.run();
}

export default mainCmdHandler;
