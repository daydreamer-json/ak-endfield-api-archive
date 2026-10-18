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
import retryUtils from '../utils/retry.js';
import stringUtils from '../utils/string.js';

interface MirrorFileEntry {
  orig: string;
  mirror: string;
  origStatus: boolean;
}

interface MirrorFileResEntry {
  md5: string;
  mirror: string;
  chunk: { start: number; length: number } | null;
}

interface MirrorFileResPatchEntry {
  md5Old: string;
  md5New: string;
  mirror: string;
  chunk: { start: number; length: number } | null;
}

interface AssetToMirror {
  url: string;
  name: string | null;
}

interface AssetToMirrorRes {
  md5: string;
  name: string;
  size: number;
  url: string;
}

interface AssetToMirrorResPatch {
  md5Old: string;
  md5New: string;
  size: number;
  url: string;
}

const networkQueue = new PQueue({ concurrency: appConfig.threadCount.network });

// Assets that failed in this run. They stay in the pending list and are retried next run.
const failures: string[] = [];

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

async function processMirrorQueue(configAuth: any, client: Octokit) {
  const owner = configAuth.github.relArchive.owner;
  const repo = configAuth.github.relArchive.repo;
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

  const selectedTag = (() => {
    const regexp = /github\.com\/.+?\/.+?\/releases\/download\/(.+?)\//;
    for (const tag of configAuth.github.relArchive.tags) {
      if (
        db.filter((e) => e.mirror.match(regexp) && e.mirror.match(regexp)![1] && e.mirror.match(regexp)![1] === tag)
          .length <= 997
      )
        return tag;
    }
    return false;
  })();
  if (!selectedTag) {
    logger.error('GitHub tag assets file count limit reached');
    return;
  }

  // Drop entries that are already mirrored (leftovers from a previous partial run).
  const remaining = pending.filter(({ url }) => !db.find((e) => e.orig.includes(stringUtils.removeQueryStr(url))));
  if (remaining.length !== pending.length) {
    logger.info(`Dropped ${pending.length - remaining.length} already-mirrored entries from pending list`);
    await Bun.write(pendingPath, JSON.stringify(remaining, null, 2));
  }

  for (const entry of [...remaining]) {
    const { url, name } = entry;
    const origUrl = stringUtils.removeQueryStr(url);
    try {
      await githubUtils.uploadAsset(client, owner, repo, selectedTag, url, name);
      db.push({
        orig: origUrl,
        mirror: `https://github.com/${owner}/${repo}/releases/download/${selectedTag}/${name ?? new URL(url).pathname.split('/').pop() ?? ''}`,
        origStatus: true,
      });
      await Bun.write(dbPath, JSON.stringify(db, null, 2));

      // Rewrite the pending list after every upload so a killed run leaves accurate state.
      remaining.splice(remaining.indexOf(entry), 1);
      await Bun.write(pendingPath, JSON.stringify(remaining, null, 2));
    } catch (err) {
      logger.error(`Mirror archive: Failed to mirror ${origUrl}: ${err}`);
      failures.push(origUrl);
    }
  }

  if (remaining.length === 0) logger.info('Mirroring process completed and pending list cleared');
}

function getSelectedTag(tags: string[], dbs: { mirror: string }[][]) {
  const regexp = /github\.com\/.+?\/.+?\/releases\/download\/(.+?)\//;
  const uniqueMirrors = [...new Set(dbs.flat().map((e) => e.mirror))];
  for (const tag of tags) {
    if (uniqueMirrors.filter((m) => m.match(regexp)?.[1] === tag).length <= 997) return tag;
  }
  return false;
}

async function processGenericResQueue<
  TAsset extends { size: number; url: string },
  TEntry extends { mirror: string; chunk: { start: number; length: number } | null },
>(
  client: Octokit,
  owner: string,
  repo: string,
  tags: string[],
  dbs: { current: TEntry[]; other: { mirror: string }[] },
  paths: { db: string; pending: string },
  options: {
    isPatch: boolean;
    chunkPrefix: string;
    getBigFileName: (asset: TAsset) => string;
    isDuplicate: (asset: TAsset, db: TEntry[]) => boolean;
    pushToDb: (asset: TAsset, db: TEntry[], mirror: string, chunk: { start: number; length: number } | null) => void;
    logPrefix: string;
    downloadLogFn: (asset: TAsset, index: number, total: number, dataLength: number) => string;
    bigFileDownloadLogFn: (asset: TAsset) => string;
  },
) {
  const ghFileSizeLimit = 2 * 1024 ** 3 - 1;
  const chunkThresholdSize = 500 * 1024 ** 2;

  if (!(await Bun.file(paths.pending).exists())) return;
  const pendingDb: TAsset[] = (await Bun.file(paths.pending).json()) ?? [];

  const validPendingDb: TAsset[] = [];
  // Entries in the original order, removed one by one as they are uploaded, so that a
  // killed run leaves an accurate pending list behind.
  const pendingOut: TAsset[] = [];

  for (const entry of pendingDb) {
    if (options.isDuplicate(entry, dbs.current)) continue;
    pendingOut.push(entry);
    if (entry.size >= ghFileSizeLimit) {
      logger.warn(
        `File size is larger than limit. Skipped${options.isPatch ? ' patch' : ''}: ${options.getBigFileName(entry)}`,
      );
      continue;
    }
    validPendingDb.push(entry);
  }

  const markUploaded = async (assets: TAsset[]) => {
    for (const asset of assets) {
      const index = pendingOut.indexOf(asset);
      if (index !== -1) pendingOut.splice(index, 1);
    }
    await Bun.write(paths.pending, JSON.stringify(pendingOut, null, 2));
  };

  if (pendingOut.length !== pendingDb.length) {
    logger.info(
      `Dropped ${pendingDb.length - pendingOut.length} already-mirrored entries from ${options.logPrefix} pending list`,
    );
    await Bun.write(paths.pending, JSON.stringify(pendingOut, null, 2));
  }

  if (validPendingDb.length === 0) {
    logger.info(`${options.logPrefix} valid pending list is empty`);
    await Bun.write(paths.pending, JSON.stringify(pendingOut, null, 2));
    return;
  }

  logger.info(`Processing ${validPendingDb.length} pending ${options.logPrefix.toLowerCase()} ...`);

  const tagPicker = () => getSelectedTag(tags, [dbs.current, dbs.other]);

  if (!tagPicker()) {
    logger.error('GitHub tag assets file count limit reached');
    return;
  }

  const chunkedFiles = validPendingDb.filter((e) => e.size < chunkThresholdSize);
  const pendingFileChunks = chunkedFiles.reduce(
    (acc, item) => {
      const lastChunk = acc.at(-1)!;
      const currentChunkSize = lastChunk.reduce((sum, i) => sum + i.size, 0);
      if (currentChunkSize + item.size <= ghFileSizeLimit) {
        lastChunk.push(item);
      } else {
        acc.push([item]);
      }
      return acc;
    },
    [[]] as TAsset[][],
  );

  if (pendingFileChunks.length === 1 && pendingFileChunks[0]!.length === 0) {
    logger.info(`${options.isPatch ? 'Patch chunk' : 'Chunk'} upload skipped`);
  } else {
    for (const chunk of pendingFileChunks) {
      const buffers: { index: number; data: Uint8Array }[] = [];
      let downloadFailed = false;
      console.log('');
      chunk.forEach((e, index) => {
        networkQueue.add(async () => {
          try {
            const data = await retryUtils.withRetry(`download ${new URL(e.url).pathname.split('/').at(-1)}`, () =>
              ky
                .get(e.url, {
                  headers: { 'User-Agent': appConfig.network.userAgent.minimum },
                  timeout: appConfig.network.timeout,
                  retry: 0,
                })
                .bytes(),
            );
            buffers.push({ index, data });
            process.stdout.write('\x1b[1A\x1b[2K');
            logger.trace(options.downloadLogFn(e, buffers.length, chunk.length, data.length));
          } catch (err) {
            downloadFailed = true;
            logger.error(
              `${options.logPrefix} download failed (will retry next run): ${new URL(e.url).pathname.split('/').at(-1)} (${err})`,
            );
          }
        });
      });
      await networkQueue.onIdle();

      // Never upload a chunk with missing members: the db offsets would not match its content.
      if (downloadFailed) {
        failures.push(...chunk.map((e) => e.url));
        continue;
      }

      buffers.sort((a, b) => a.index - b.index);

      const chunkTotalSize = mathUtils.arrayTotal(buffers.map((e) => e.data.length));
      const combinedBuffer = new Uint8Array(chunkTotalSize);
      let offset = 0;
      for (const item of buffers) {
        combinedBuffer.set(item.data, offset);
        offset += item.data.length;
      }
      const combinedBufferMd5 = new Bun.CryptoHasher('md5').update(combinedBuffer).digest('hex');
      const chunkFileName = `${options.chunkPrefix}${combinedBufferMd5}.bin`;
      const currentTag = tagPicker();
      if (!currentTag) {
        logger.error('GitHub tag assets file count limit reached');
        failures.push('GitHub tag assets file count limit reached');
        break;
      }

      try {
        await githubUtils.uploadAssetWithBuffer(client, owner, repo, currentTag, chunkFileName, combinedBuffer);

        offset = 0;
        for (const item of chunk) {
          options.pushToDb(
            item,
            dbs.current,
            `https://github.com/${owner}/${repo}/releases/download/${currentTag}/${chunkFileName}`,
            { start: offset, length: item.size },
          );
          offset += item.size;
        }
        await Bun.write(paths.db, Bun.zstdCompressSync(JSON.stringify(dbs.current), { level: 16 }));
        await markUploaded(chunk);
      } catch (err) {
        logger.error(`${options.logPrefix} chunk upload failed (will retry next run): ${chunkFileName} (${err})`);
        failures.push(...chunk.map((e) => e.url));
      }
    }
  }

  const bigFiles = validPendingDb.filter((e) => e.size >= chunkThresholdSize);

  if (bigFiles.length > 0) {
    logger.info(`Processing big pending ${options.logPrefix.toLowerCase()} ...`);
    networkQueue.concurrency = 4;
    for (const file of bigFiles) {
      networkQueue.add(async () => {
        try {
          const buffer: Uint8Array = await retryUtils.withRetry(`download ${options.getBigFileName(file)}`, () =>
            ky
              .get(file.url, {
                headers: { 'User-Agent': appConfig.network.userAgent.minimum },
                timeout: appConfig.network.timeout,
                retry: 0,
              })
              .bytes(),
          );
          logger.trace(options.bigFileDownloadLogFn(file));
          const currentTag = tagPicker();
          if (!currentTag) throw new Error('GitHub tag assets file count limit reached');

          const fileName = options.getBigFileName(file);
          await githubUtils.uploadAssetWithBuffer(client, owner, repo, currentTag, fileName, buffer);
          options.pushToDb(
            file,
            dbs.current,
            `https://github.com/${owner}/${repo}/releases/download/${currentTag}/${fileName}`,
            null,
          );
          await Bun.write(paths.db, Bun.zstdCompressSync(JSON.stringify(dbs.current), { level: 16 }));
          await markUploaded([file]);
        } catch (err) {
          logger.error(
            `${options.logPrefix} upload failed (will retry next run): ${options.getBigFileName(file)} (${err})`,
          );
          failures.push(options.getBigFileName(file));
        }
      });
    }
    await networkQueue.onIdle();
    networkQueue.concurrency = appConfig.threadCount.network;
  }
}

async function processMirrorResQueue(configAuth: any, client: Octokit) {
  const owner = configAuth.github.relArchiveRes.owner;
  const repo = configAuth.github.relArchiveRes.repo;
  const outputDir = argvUtils.getArgv()['outputDir'];
  const dbPath = path.join(outputDir, 'mirror_file_res_list.json.zst');
  const patchDbPath = path.join(outputDir, 'mirror_file_res_patch_list.json.zst');
  const pendingDbPath = path.join(outputDir, 'mirror_file_res_list_pending.json');

  const db: MirrorFileResEntry[] = (await Bun.file(dbPath).exists())
    ? JSON.parse(Bun.zstdDecompressSync(await Bun.file(dbPath).bytes()).toString('utf-8'))
    : [];
  const patchDb: MirrorFileResPatchEntry[] = (await Bun.file(patchDbPath).exists())
    ? JSON.parse(Bun.zstdDecompressSync(await Bun.file(patchDbPath).bytes()).toString('utf-8'))
    : [];

  await processGenericResQueue<AssetToMirrorRes, MirrorFileResEntry>(
    client,
    owner,
    repo,
    configAuth.github.relArchiveRes.tags,
    { current: db, other: patchDb },
    { db: dbPath, pending: pendingDbPath },
    {
      isPatch: false,
      chunkPrefix: 'VFS_Chunk_',
      getBigFileName: (file) => file.name,
      isDuplicate: (entry, db) => db.some((e) => e.md5 === entry.md5),
      pushToDb: (item, db, mirror, chunk) => {
        db.push({ md5: item.md5, mirror, chunk });
      },
      logPrefix: 'Res',
      downloadLogFn: (e, current, total, dataLength) =>
        `Downloaded: ${current.toString().padStart(total.toString().length, ' ')} / ${total}, ${new URL(e.url).pathname.split('/').at(-1)}, ${formatBytes(dataLength)}`,
      bigFileDownloadLogFn: (file) => `Downloaded: ${file.name}`,
    },
  );
}

async function processMirrorResPatchQueue(configAuth: any, client: Octokit) {
  const owner = configAuth.github.relArchiveRes.owner;
  const repo = configAuth.github.relArchiveRes.repo;
  const outputDir = argvUtils.getArgv()['outputDir'];
  const dbPath = path.join(outputDir, 'mirror_file_res_list.json.zst');
  const patchDbPath = path.join(outputDir, 'mirror_file_res_patch_list.json.zst');
  const pendingDbPath = path.join(outputDir, 'mirror_file_res_patch_list_pending.json');

  const db: MirrorFileResEntry[] = (await Bun.file(dbPath).exists())
    ? JSON.parse(Bun.zstdDecompressSync(await Bun.file(dbPath).bytes()).toString('utf-8'))
    : [];
  const patchDb: MirrorFileResPatchEntry[] = (await Bun.file(patchDbPath).exists())
    ? JSON.parse(Bun.zstdDecompressSync(await Bun.file(patchDbPath).bytes()).toString('utf-8'))
    : [];

  await processGenericResQueue<AssetToMirrorResPatch, MirrorFileResPatchEntry>(
    client,
    owner,
    repo,
    configAuth.github.relArchiveRes.tags,
    { current: patchDb, other: db },
    { db: patchDbPath, pending: pendingDbPath },
    {
      isPatch: true,
      chunkPrefix: 'VFS_Patch_Chunk_',
      getBigFileName: (file) => `VFS_Patch_${file.md5Old}_${file.md5New}.bin`,
      isDuplicate: (entry, db) => db.some((e) => e.md5Old === entry.md5Old && e.md5New === entry.md5New),
      pushToDb: (item, db, mirror, chunk) => {
        db.push({ md5Old: item.md5Old, md5New: item.md5New, mirror, chunk });
      },
      logPrefix: 'Res patch',
      downloadLogFn: (e, current, total, dataLength) =>
        `Downloaded Patch: ${current.toString().padStart(total.toString().length, ' ')} / ${total}, ${e.md5Old.slice(0, 8)}... -> ${e.md5New.slice(0, 8)}..., ${formatBytes(dataLength)}`,
      bigFileDownloadLogFn: (file) => `Downloaded Patch: ${file.md5Old} -> ${file.md5New}`,
    },
  );
}

async function mainCmdHandler() {
  const authPath = 'config/config_auth.yaml';
  if (!(await Bun.file(authPath).exists())) {
    logger.error('Config auth not found');
    return;
  }
  const configAuth = YAML.parse(await Bun.file(authPath).text());
  const clients = {
    main: new Octokit({ auth: configAuth.github.main.token }),
    relArchive: new Octokit({ auth: configAuth.github.relArchive.token }),
    relArchiveRes: new Octokit({ auth: configAuth.github.relArchiveRes.token }),
  };
  logger.info('Logged in to GitHub');

  if (await githubUtils.checkIsActionRunning(clients.main, configAuth.github.main.owner, configAuth.github.main.repo)) {
    logger.error('Duplicate execution detected (GitHub Action is already running)');
    return;
  }

  await checkMirrorFileDbStatus();
  await processMirrorQueue(configAuth, clients.relArchive);
  await processMirrorResQueue(configAuth, clients.relArchiveRes);
  await processMirrorResPatchQueue(configAuth, clients.relArchiveRes);

  // Exit non-zero so the failed assets are visible, but only after every queue had a chance to run.
  if (failures.length > 0) throw new Error(`Failed to mirror ${failures.length} asset(s)`);

  // const relInfo = await githubUtils.getReleaseInfo(octoClient, githubAuthCfg);
  // if (relInfo) {
  //   logger.info(`GitHub Releases total size: ${formatBytes(mathUtils.arrayTotal(relInfo.assets.map((a) => a.size)))}`);
  // }
}

export default mainCmdHandler;
