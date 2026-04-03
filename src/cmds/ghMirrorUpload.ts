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
  if (!selectedTag) logger.error('GitHub tag assets file count limit reached');

  for (const { url, name } of pending) {
    const origUrl = stringUtils.removeQueryStr(url);
    if (!db.find((e) => e.orig.includes(origUrl))) {
      await githubUtils.uploadAsset(client, owner, repo, selectedTag, url, name);
      db.push({
        orig: origUrl,
        mirror: `https://github.com/${owner}/${repo}/releases/download/${selectedTag}/${name ?? new URL(url).pathname.split('/').pop() ?? ''}`,
        origStatus: true,
      });
      await Bun.write(dbPath, JSON.stringify(db, null, 2));
    }
  }

  await Bun.write(pendingPath, JSON.stringify([], null, 2));
  logger.info('Mirroring process completed and pending list cleared');
}

async function processMirrorResQueue(configAuth: any, client: Octokit) {
  const ghFileSizeLimit = 2 * 1024 ** 3 - 1;
  const owner = configAuth.github.relArchiveRes.owner;
  const repo = configAuth.github.relArchiveRes.repo;
  const outputDir = argvUtils.getArgv()['outputDir'];
  const dbPath = path.join(outputDir, 'mirror_file_res_list.json.zst');
  const patchDbPath = path.join(outputDir, 'mirror_file_res_patch_list.json.zst');
  const pendingDbPath = path.join(outputDir, 'mirror_file_res_list_pending.json');
  const patchPendingDbPath = path.join(outputDir, 'mirror_file_res_patch_list_pending.json');
  const db: MirrorFileResEntry[] = JSON.parse(Bun.zstdDecompressSync(await Bun.file(dbPath).bytes()).toString('utf-8'));
  const patchDb: MirrorFileResPatchEntry[] = JSON.parse(
    Bun.zstdDecompressSync(await Bun.file(patchDbPath).bytes()).toString('utf-8'),
  );
  const pendingDb: AssetToMirrorRes[] = (await Bun.file(pendingDbPath).json()) ?? [];
  const validPendingDb: AssetToMirrorRes[] = [];
  const newPendingDb: AssetToMirrorRes[] = [];

  for (const entry of pendingDb) {
    if (db.some((e) => e.md5 === entry.md5)) continue;
    if (entry.size >= ghFileSizeLimit) {
      logger.warn(`File size is larger than limit. Skipped: ${entry.name}`);
      newPendingDb.push(entry);
      continue;
    }
    validPendingDb.push(entry);
  }

  if (validPendingDb.length === 0) {
    logger.info('Res valid pending list is empty');
  } else {
    logger.info(`Processing ${validPendingDb.length} pending res ...`);

    const getSelectedTag = () => {
      const regexp = /github\.com\/.+?\/.+?\/releases\/download\/(.+?)\//;
      for (const tag of configAuth.github.relArchiveRes.tags) {
        if (
          [...new Set([...db, ...patchDb].map((e) => e.mirror))].filter(
            (e) => e.match(regexp) && e.match(regexp)![1] && e.match(regexp)![1] === tag,
          ).length <= 997
        )
          return tag as string;
      }
      return false;
    };

    if (!getSelectedTag()) {
      logger.error('GitHub tag assets file count limit reached');
      return;
    }

    const pendingFileChunkSizeLimit = ghFileSizeLimit;
    const chunkThresholdSize = 500 * 1024 ** 2;
    const pendingFileChunks = validPendingDb
      .filter((e) => e.size < chunkThresholdSize)
      .reduce(
        (acc, item) => {
          const lastChunk = acc.at(-1)!;
          const currentChunkSize = lastChunk.reduce((sum, i) => sum + i.size, 0);
          if (currentChunkSize + item.size <= pendingFileChunkSizeLimit) {
            lastChunk.push(item);
          } else {
            acc.push([item]);
          }
          return acc;
        },
        [[]] as AssetToMirrorRes[][],
      );
    if (pendingFileChunks.length === 1 && pendingFileChunks[0]!.length === 0) {
      logger.info('Chunk upload skipped');
      await Bun.write(pendingDbPath, JSON.stringify(validPendingDb, null, 2));
    } else {
      for (const chunk of pendingFileChunks) {
        const buffers: { index: number; data: Uint8Array }[] = [];
        console.log('');
        chunk.forEach((e, index) => {
          networkQueue.add(async () => {
            const data = await ky
              .get(e.url, {
                headers: { 'User-Agent': appConfig.network.userAgent.minimum },
                timeout: appConfig.network.timeout,
                retry: { limit: appConfig.network.retryCount },
              })
              .bytes();
            buffers.push({ index, data });
            process.stdout.write('\x1b[1A\x1b[2K');
            logger.trace(
              `Downloaded: ${buffers.length.toString().padStart(chunk.length.toString().length, ' ')} / ${chunk.length}, ${new URL(e.url).pathname.split('/').at(-1)}, ${formatBytes(data.length)}`,
            );
          });
        });
        await networkQueue.onIdle();
        buffers.sort((a, b) => a.index - b.index);

        const chunkTotalSize = mathUtils.arrayTotal(buffers.map((e) => e.data.length));
        const combinedBuffer = new Uint8Array(chunkTotalSize);
        let offset = 0;
        for (const item of buffers) {
          combinedBuffer.set(item.data, offset);
          offset += item.data.length;
        }
        const combinedBufferMd5 = new Bun.CryptoHasher('md5').update(combinedBuffer).digest('hex');
        const chunkFileName = `VFS_Chunk_${combinedBufferMd5}.bin`;
        if (getSelectedTag() === false) throw new Error('GitHub tag assets file count limit reached');
        await githubUtils.uploadAssetWithBuffer(
          client,
          owner,
          repo,
          getSelectedTag() as string,
          chunkFileName,
          combinedBuffer,
        );

        offset = 0;
        for (const item of chunk) {
          db.push({
            md5: item.md5,
            mirror: `https://github.com/${owner}/${repo}/releases/download/${getSelectedTag()}/${chunkFileName}`,
            chunk: { start: offset, length: item.size },
          });
          offset += item.size;
        }
        await Bun.write(dbPath, Bun.zstdCompressSync(JSON.stringify(db), { level: 16 }));
      }
    }

    const bigFiles = validPendingDb.filter((e) => e.size >= chunkThresholdSize);
    await Bun.write(pendingDbPath, JSON.stringify([...newPendingDb, ...bigFiles], null, 2));

    {
      if (bigFiles.length > 0) logger.info('Processing big pending res ...');
      networkQueue.concurrency = 4;
      for (const file of bigFiles) {
        networkQueue.add(async () => {
          const buffer: Uint8Array = await ky
            .get(file.url, {
              headers: { 'User-Agent': appConfig.network.userAgent.minimum },
              timeout: appConfig.network.timeout,
              retry: { limit: appConfig.network.retryCount },
            })
            .bytes();
          logger.trace('Downloaded: ' + file.name);
          if (getSelectedTag() === false) throw new Error('GitHub tag assets file count limit reached');

          await githubUtils.uploadAssetWithBuffer(client, owner, repo, getSelectedTag() as string, file.name, buffer);
          db.push({
            md5: file.md5,
            mirror: `https://github.com/${owner}/${repo}/releases/download/${getSelectedTag()}/${file.name}`,
            chunk: null,
          });
          await Bun.write(dbPath, Bun.zstdCompressSync(JSON.stringify(db), { level: 16 }));
        });
      }
      await networkQueue.onIdle();
      networkQueue.concurrency = appConfig.threadCount.network;
    }
  }

  await Bun.write(pendingDbPath, JSON.stringify([...newPendingDb], null, 2));
}

async function processMirrorResPatchQueue(configAuth: any, client: Octokit) {
  const ghFileSizeLimit = 2 * 1024 ** 3 - 1;
  const owner = configAuth.github.relArchiveRes.owner;
  const repo = configAuth.github.relArchiveRes.repo;
  const outputDir = argvUtils.getArgv()['outputDir'];
  const dbPath = path.join(outputDir, 'mirror_file_res_list.json.zst');
  const patchDbPath = path.join(outputDir, 'mirror_file_res_patch_list.json.zst');
  const pendingDbPath = path.join(outputDir, 'mirror_file_res_patch_list_pending.json');

  if (!(await Bun.file(pendingDbPath).exists())) return;

  const db: MirrorFileResEntry[] = (await Bun.file(dbPath).exists())
    ? JSON.parse(Bun.zstdDecompressSync(await Bun.file(dbPath).bytes()).toString('utf-8'))
    : [];
  const patchDb: MirrorFileResPatchEntry[] = (await Bun.file(patchDbPath).exists())
    ? JSON.parse(Bun.zstdDecompressSync(await Bun.file(patchDbPath).bytes()).toString('utf-8'))
    : [];
  const pendingDb: AssetToMirrorResPatch[] = (await Bun.file(pendingDbPath).json()) ?? [];
  const validPendingDb: AssetToMirrorResPatch[] = [];
  const newPendingDb: AssetToMirrorResPatch[] = [];

  for (const entry of pendingDb) {
    if (patchDb.some((e) => e.md5Old === entry.md5Old && e.md5New === entry.md5New)) continue;
    if (entry.size >= ghFileSizeLimit) {
      logger.warn(`File size is larger than limit. Skipped patch: ${entry.md5Old} -> ${entry.md5New}`);
      newPendingDb.push(entry);
      continue;
    }
    validPendingDb.push(entry);
  }

  if (validPendingDb.length === 0) {
    logger.info('Res patch valid pending list is empty');
  } else {
    logger.info(`Processing ${validPendingDb.length} pending res patches ...`);

    const getSelectedTag = () => {
      const regexp = /github\.com\/.+?\/.+?\/releases\/download\/(.+?)\//;
      for (const tag of configAuth.github.relArchiveRes.tags) {
        if (
          [...new Set([...db, ...patchDb].map((e) => e.mirror))].filter(
            (e) => e.match(regexp) && e.match(regexp)![1] && e.match(regexp)![1] === tag,
          ).length <= 997
        )
          return tag as string;
      }
      return false;
    };

    if (!getSelectedTag()) {
      logger.error('GitHub tag assets file count limit reached');
      return;
    }

    const chunkThresholdSize = 500 * 1024 ** 2;
    const pendingFileChunks = validPendingDb
      .filter((e) => e.size < chunkThresholdSize)
      .reduce(
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
        [[]] as AssetToMirrorResPatch[][],
      );

    if (pendingFileChunks.length === 1 && pendingFileChunks[0]!.length === 0) {
      logger.info('Patch chunk upload skipped');
    } else {
      for (const chunk of pendingFileChunks) {
        const buffers: { index: number; data: Uint8Array }[] = [];
        console.log('');
        chunk.forEach((e, index) => {
          networkQueue.add(async () => {
            const data = await ky
              .get(e.url, {
                headers: { 'User-Agent': appConfig.network.userAgent.minimum },
                timeout: appConfig.network.timeout,
                retry: { limit: appConfig.network.retryCount },
              })
              .bytes();
            buffers.push({ index, data });
            process.stdout.write('\x1b[1A\x1b[2K');
            logger.trace(
              `Downloaded Patch: ${buffers.length.toString().padStart(chunk.length.toString().length, ' ')} / ${chunk.length}, ${e.md5Old.slice(0, 8)}... -> ${e.md5New.slice(0, 8)}..., ${formatBytes(data.length)}`,
            );
          });
        });
        await networkQueue.onIdle();
        buffers.sort((a, b) => a.index - b.index);

        const combinedBuffer = new Uint8Array(mathUtils.arrayTotal(buffers.map((e) => e.data.length)));
        let offset = 0;
        for (const item of buffers) {
          combinedBuffer.set(item.data, offset);
          offset += item.data.length;
        }
        const combinedBufferMd5 = new Bun.CryptoHasher('md5').update(combinedBuffer).digest('hex');
        const chunkFileName = `VFS_Patch_Chunk_${combinedBufferMd5}.bin`;
        const tag = getSelectedTag();
        if (!tag) throw new Error('GitHub tag assets file count limit reached');

        await githubUtils.uploadAssetWithBuffer(client, owner, repo, tag, chunkFileName, combinedBuffer);

        offset = 0;
        for (const item of chunk) {
          patchDb.push({
            md5Old: item.md5Old,
            md5New: item.md5New,
            mirror: `https://github.com/${owner}/${repo}/releases/download/${tag}/${chunkFileName}`,
            chunk: { start: offset, length: item.size },
          });
          offset += item.size;
        }
        await Bun.write(patchDbPath, Bun.zstdCompressSync(JSON.stringify(patchDb), { level: 16 }));
      }
    }

    const bigFiles = validPendingDb.filter((e) => e.size >= chunkThresholdSize);
    if (bigFiles.length > 0) {
      logger.info('Processing big pending patches ...');
      networkQueue.concurrency = 4;
      for (const file of bigFiles) {
        networkQueue.add(async () => {
          const buffer = await ky
            .get(file.url, {
              headers: { 'User-Agent': appConfig.network.userAgent.minimum },
              timeout: appConfig.network.timeout,
              retry: { limit: appConfig.network.retryCount },
            })
            .bytes();
          logger.trace(`Downloaded Patch: ${file.md5Old} -> ${file.md5New}`);
          const tag = getSelectedTag();
          if (!tag) throw new Error('GitHub tag assets file count limit reached');

          const fileName = `VFS_Patch_${file.md5Old}_${file.md5New}.bin`;
          await githubUtils.uploadAssetWithBuffer(client, owner, repo, tag, fileName, buffer);
          patchDb.push({
            md5Old: file.md5Old,
            md5New: file.md5New,
            mirror: `https://github.com/${owner}/${repo}/releases/download/${tag}/${fileName}`,
            chunk: null,
          });
          await Bun.write(patchDbPath, Bun.zstdCompressSync(JSON.stringify(patchDb), { level: 16 }));
        });
      }
      await networkQueue.onIdle();
      networkQueue.concurrency = appConfig.threadCount.network;
    }
  }

  await Bun.write(pendingDbPath, JSON.stringify([...newPendingDb], null, 2));
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

  // const relInfo = await githubUtils.getReleaseInfo(octoClient, githubAuthCfg);
  // if (relInfo) {
  //   logger.info(`GitHub Releases total size: ${formatBytes(mathUtils.arrayTotal(relInfo.assets.map((a) => a.size)))}`);
  // }
}

export default mainCmdHandler;
