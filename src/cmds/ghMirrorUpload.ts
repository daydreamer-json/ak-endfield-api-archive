import path from 'node:path';
import { Octokit } from '@octokit/rest';
import ky from 'ky';
import PQueue from 'p-queue';
import YAML from 'yaml';
import argvUtils from '../utils/argv.js';
import appConfig from '../utils/config.js';
import githubUtils from '../utils/github.js';
import logger from '../utils/logger.js';
import mathUtils from '../utils/math.js';
import stringUtils from '../utils/string.js';

interface MirrorFileEntry {
  orig: string;
  mirror: string;
  origStatus: boolean;
}

interface AssetToMirror {
  url: string;
  name: string | null;
}

let githubAuthCfg: any = null;
let octoClient: Octokit | null = null;
const networkQueue = new PQueue({ concurrency: appConfig.threadCount.network });

const formatBytes = (size: number) =>
  mathUtils.formatFileSize(size, {
    decimals: 2,
    decimalPadding: true,
    unitVisible: true,
    useBinaryUnit: true,
    useBitUnit: false,
    unit: null,
  });

async function checkMirrorFileDbStatus() {
  logger.info('Checking mirrored files availability ...');
  const outputDir = argvUtils.getArgv()['outputDir'];
  const dbPath = path.join(outputDir, 'mirror_file_list.json');
  if (!(await Bun.file(dbPath).exists())) return;

  const db = (await Bun.file(dbPath).json()) as MirrorFileEntry[];

  for (const entry of db) {
    networkQueue.add(async () => {
      try {
        await ky.head(entry.orig, {
          headers: { 'User-Agent': appConfig.network.userAgent.minimum },
          timeout: appConfig.network.timeout,
          retry: { limit: appConfig.network.retryCount },
        });
        entry.origStatus = true;
      } catch {
        if (entry.origStatus) logger.trace(`Orig inaccessible: ${entry.orig.split('/').pop()}`);
        entry.origStatus = false;
      }
    });
  }
  await networkQueue.onIdle();
  await Bun.write(dbPath, JSON.stringify(db, null, 2));
}

async function processMirrorQueue() {
  const outputDir = argvUtils.getArgv()['outputDir'];
  const dbPath = path.join(outputDir, 'mirror_file_list.json');
  const pendingPath = path.join(outputDir, 'mirror_file_list_pending.json');

  if (!(await Bun.file(pendingPath).exists())) {
    logger.info('No pending assets to mirror');
    return;
  }

  const db: MirrorFileEntry[] = (await Bun.file(dbPath).exists()) ? await Bun.file(dbPath).json() : [];
  const pending: AssetToMirror[] = await Bun.file(pendingPath).json();

  if (pending.length === 0) {
    logger.info('Pending list is empty');
    return;
  }

  logger.info(`Processing ${pending.length} pending assets ...`);

  for (const { url, name } of pending) {
    const origUrl = stringUtils.removeQueryStr(url);
    if (!db.find((e) => e.orig.includes(origUrl))) {
      await githubUtils.uploadAsset(octoClient, githubAuthCfg, url, name);
      if (githubAuthCfg) {
        db.push({
          orig: origUrl,
          mirror: `https://github.com/${githubAuthCfg.github.relArchive.owner}/${githubAuthCfg.github.relArchive.repo}/releases/download/${githubAuthCfg.github.relArchive.tag}/${name ?? new URL(url).pathname.split('/').pop() ?? ''}`,
          origStatus: true,
        });
        await Bun.write(dbPath, JSON.stringify(db, null, 2));
      }
    }
  }

  // Clear pending list
  await Bun.write(pendingPath, JSON.stringify([], null, 2));
  logger.info('Mirroring process completed and pending list cleared');
}

async function mainCmdHandler() {
  const authPath = 'config/config_auth.yaml';
  if (await Bun.file(authPath).exists()) {
    githubAuthCfg = YAML.parse(await Bun.file(authPath).text());
    logger.info('Logging in to GitHub');
    octoClient = new Octokit({ auth: githubAuthCfg.github.relArchive.token });
  } else {
    logger.error('GitHub authentication config not found');
    return;
  }

  if (await githubUtils.checkIsActionRunning(githubAuthCfg)) {
    logger.error('Duplicate execution detected (GitHub Action is already running)');
    return;
  }

  await checkMirrorFileDbStatus();
  await processMirrorQueue();

  const relInfo = await githubUtils.getReleaseInfo(octoClient, githubAuthCfg);
  if (relInfo) {
    logger.info(`GitHub Releases total size: ${formatBytes(mathUtils.arrayTotal(relInfo.assets.map((a) => a.size)))}`);
  }
}

export default mainCmdHandler;
