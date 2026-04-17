import path from 'node:path';
import ky, { HTTPError } from 'ky';
import { DateTime } from 'luxon';
import PQueue from 'p-queue';
import semver from 'semver';
import type * as IResEndfield from '../types/api/akEndfield/Res.js';
import apiUtils from '../utils/api/index.js';
import argvUtils from '../utils/argv.js';
import cipher from '../utils/cipher.js';
import appConfig from '../utils/config.js';
import logger from '../utils/logger.js';
import mathUtils from '../utils/math.js';
import stringUtils from '../utils/string.js';

// Types
type LatestGameResponse = Awaited<ReturnType<typeof apiUtils.akEndfield.launcher.latestGame>>;
type LatestGameResourcesResponse = Awaited<ReturnType<typeof apiUtils.akEndfield.launcher.latestGameResources>>;

interface StoredData<T> {
  req: any;
  rsp: T;
  updatedAt: string;
}

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

interface GameTarget {
  name: string;
  region: 'os' | 'cn';
  appCode: string;
  launcherAppCode: string;
  channel: number;
  subChannel: number;
  launcherSubChannel: number;
  dirName: string;
}

interface LauncherTarget {
  id: 'os' | 'cn';
  apps: ('EndField' | 'Arknights' | 'Official')[];
  code: string;
  channel: number;
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

// Global/Shared State
const assetsToMirror: AssetToMirror[] = [];
const networkQueue = new PQueue({ concurrency: appConfig.threadCount.network });

// Constants
const diffIgnoreRules = [
  ['rsp', 'pkg', 'url'],
  ['rsp', 'pkg', 'packs', '*', 'url'],
  ['rsp', 'patch', 'url'],
  ['rsp', 'patch', 'patches', '*', 'url'],
  ['rsp', 'zip_package_url'],
  ['rsp', 'exe_url'],
  ['rsp', 'patch', 'v2_patch_info_url'],
].map((path) => ({ path, pattern: /[?&]auth_key=[^&]+/g }));

// Utilities
const formatBytes = (size: number) =>
  mathUtils.formatFileSize(size, {
    decimals: 2,
    decimalPadding: true,
    unitVisible: true,
    useBinaryUnit: true,
    useBitUnit: false,
    unit: null,
  });

function getObjectDiff(
  obj1: any,
  obj2: any,
  ignoreRules: { path: string[]; pattern: RegExp }[] = [],
  currentPath: string[] = [],
) {
  const diff: any = {};
  const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

  for (const key of keys) {
    const val1 = obj1?.[key];
    const val2 = obj2?.[key];
    const fullPath = [...currentPath, key];
    if (JSON.stringify(val1) === JSON.stringify(val2)) continue;

    const rule = ignoreRules.find(
      (r) => r.path.length === fullPath.length && r.path.every((p, i) => p === '*' || p === fullPath[i]),
    );

    if (rule && typeof val1 === 'string' && typeof val2 === 'string') {
      const normalized1 = val1.replace(rule.pattern, '');
      const normalized2 = val2.replace(rule.pattern, '');
      if (normalized1 === normalized2) continue;
    }

    if (typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null) {
      const nestedDiff = getObjectDiff(val1, val2, ignoreRules, fullPath);
      if (Object.keys(nestedDiff).length > 0) diff[key] = nestedDiff;
    } else {
      diff[key] = { old: val1, new: val2 };
    }
  }
  return diff;
}

async function saveResultWithHistory<T>(
  subPaths: string[],
  version: string | null,
  data: { req: any; rsp: T },
  options: {
    saveLatest?: boolean;
    ignoreRules?: typeof diffIgnoreRules;
    allFileName?: string;
  } = {},
) {
  const { saveLatest = true, ignoreRules = [], allFileName = 'all.json' } = options;
  const outputDir = argvUtils.getArgv()['outputDir'];
  const filePathBase = path.join(outputDir, ...subPaths);
  const dataStr = JSON.stringify(data, null, 2);

  // 1. Save v{version}.json and latest.json if changed
  const filesToCheck: string[] = [];
  if (version) filesToCheck.push(path.join(filePathBase, `v${version}.json`));
  if (saveLatest) filesToCheck.push(path.join(filePathBase, 'latest.json'));

  for (const filePath of filesToCheck) {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      await Bun.write(filePath, dataStr);
    } else {
      const currentData = await file.json();
      const diff = getObjectDiff(currentData, data, ignoreRules);
      if (Object.keys(diff).length > 0) {
        logger.trace(`Diff detected in ${filePath}:`, JSON.stringify(diff, null, 2));
        await Bun.write(filePath, dataStr);
      }
    }
  }

  // 2. Update all.json history
  const allFilePath = path.join(filePathBase, allFileName);
  const allFile = Bun.file(allFilePath);
  let allData: StoredData<T>[] = (await allFile.exists()) ? await allFile.json() : [];

  const exists = allData.some((e) => {
    const diff = getObjectDiff({ req: e.req, rsp: e.rsp }, data, ignoreRules);
    return Object.keys(diff).length === 0;
  });

  if (!exists) {
    allData.push({ updatedAt: DateTime.now().toISO(), ...data });
    await Bun.write(allFilePath, JSON.stringify(allData, null, 2));
    return true; // was updated
  }
  return false;
}

function queueAssetForMirroring(url: string, name: string | null = null) {
  assetsToMirror.push({ url, name });
}

// Core Fetching Logic
async function fetchAndSaveLatestGames(gameTargets: GameTarget[]) {
  logger.debug('Fetching latestGame ...');
  for (const target of gameTargets) {
    const rsp = await apiUtils.akEndfield.launcher.latestGame(
      target.appCode,
      target.launcherAppCode,
      target.channel,
      target.subChannel,
      target.launcherSubChannel,
      null,
      target.region,
    );
    logger.info(
      `Fetched latestGame: ${target.region.toUpperCase()}, ${target.name}, v${rsp.version}, ${formatBytes(
        parseInt(rsp.pkg.total_size) - mathUtils.arrayTotal(rsp.pkg.packs.map((e) => parseInt(e.package_size))),
      )}`,
    );

    const prettyRsp = {
      req: {
        appCode: target.appCode,
        launcherAppCode: target.launcherAppCode,
        channel: target.channel,
        subChannel: target.subChannel,
        launcherSubChannel: target.launcherSubChannel,
      },
      rsp,
    };

    const subChns = appConfig.network.api.akEndfield.subChannel;
    if ([subChns.cnWinRel, subChns.cnWinRelBilibili, subChns.osWinRel].includes(target.subChannel)) {
      if (rsp.pkg.url) queueAssetForMirroring(rsp.pkg.url);
      rsp.pkg.packs.forEach((e) => queueAssetForMirroring(e.url));
    }

    await saveResultWithHistory(['akEndfield', 'launcher', 'game', target.dirName], rsp.version, prettyRsp, {
      ignoreRules: diffIgnoreRules,
    });
  }
}

async function fetchAndSaveLatestGamePatches(gameTargets: GameTarget[]) {
  logger.debug('Fetching latestGamePatch ...');
  for (const target of gameTargets) {
    const gameAllPath = path.join(
      argvUtils.getArgv()['outputDir'],
      'akEndfield',
      'launcher',
      'game',
      target.dirName,
      'all.json',
    );
    if (!(await Bun.file(gameAllPath).exists())) continue;

    const gameAll = (await Bun.file(gameAllPath).json()) as StoredData<LatestGameResponse>[];
    const patchAllPath = path.join(
      argvUtils.getArgv()['outputDir'],
      'akEndfield',
      'launcher',
      'game',
      target.dirName,
      'all_patch.json',
    );
    let patchAll: StoredData<LatestGameResponse>[] = (await Bun.file(patchAllPath).exists())
      ? await Bun.file(patchAllPath).json()
      : [];

    const versionList = [...new Set(gameAll.map((e) => e.rsp.version))].sort((a, b) => semver.compare(b, a)).slice(1);
    let needWrite = false;

    for (const ver of versionList) {
      networkQueue.add(async () => {
        const rsp = await apiUtils.akEndfield.launcher.latestGame(
          target.appCode,
          target.launcherAppCode,
          target.channel,
          target.subChannel,
          target.launcherSubChannel,
          ver,
          target.region,
        );
        if (!rsp.patch) return;

        const prettyRsp = {
          req: {
            appCode: target.appCode,
            launcherAppCode: target.launcherAppCode,
            channel: target.channel,
            subChannel: target.subChannel,
            launcherSubChannel: target.launcherSubChannel,
            version: ver,
          },
          rsp,
        };

        const exists = patchAll.some(
          (e) => Object.keys(getObjectDiff({ req: e.req, rsp: e.rsp }, prettyRsp, diffIgnoreRules)).length === 0,
        );

        if (!exists) {
          logger.debug(
            `Fetched latestGamePatch: ${target.region.toUpperCase()}, ${target.name}, v${rsp.request_version} -> v${rsp.version}, ${formatBytes(parseInt(rsp.patch.total_size) - parseInt(rsp.patch.package_size))}`,
          );
          patchAll.push({ updatedAt: DateTime.now().toISO(), ...prettyRsp });
          needWrite = true;

          const subChns = appConfig.network.api.akEndfield.subChannel;
          if ([subChns.cnWinRel, subChns.cnWinRelBilibili, subChns.osWinRel].includes(target.subChannel)) {
            // queueAssetForMirroring(
            //   rsp.patch.url,
            //   new URL(rsp.patch.url).pathname.split('/').filter(Boolean).slice(-3).join('_'),
            // );
            rsp.patch.patches.forEach((e) =>
              queueAssetForMirroring(e.url, new URL(e.url).pathname.split('/').filter(Boolean).slice(-6).join('_')),
            );
          }
        }
      });
    }

    await networkQueue.onIdle();

    if (needWrite) {
      await Bun.write(patchAllPath, JSON.stringify(patchAll, null, 2));
    }
  }
  for (const target of gameTargets) {
    const patchAllPath = path.join(
      argvUtils.getArgv()['outputDir'],
      'akEndfield',
      'launcher',
      'game',
      target.dirName,
      'all_patch.json',
    );
    const patchAll: StoredData<LatestGameResponse>[] = (await Bun.file(patchAllPath).exists())
      ? await Bun.file(patchAllPath).json()
      : [];
    for (const e of patchAll) {
      if (!e.rsp.patch) continue;
      const v2PatchInfoUrl = e.rsp.patch.v2_patch_info_url;
      if (!v2PatchInfoUrl) continue;
      await downloadRawFile(v2PatchInfoUrl);
    }
  }
}

async function fetchAndSaveLatestGameResources(gameTargets: GameTarget[]) {
  logger.debug('Fetching latestGameRes ...');
  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;

  const filteredTargets = gameTargets.filter(
    (t) => t.channel !== appConfig.network.api.akEndfield.channel.cnWinRelBilibili,
  );
  const uniqueTargets = Array.from(
    new Set(filteredTargets.map((t) => JSON.stringify({ region: t.region, appCode: t.appCode, channel: t.channel }))),
  ).map((s) => JSON.parse(s));

  for (const target of uniqueTargets) {
    const gameAllPath = path.join(
      argvUtils.getArgv()['outputDir'],
      'akEndfield',
      'launcher',
      'game',
      String(target.channel),
      'all.json',
    );
    if (!(await Bun.file(gameAllPath).exists())) continue;

    const versionInfos = ((await Bun.file(gameAllPath).json()) as StoredData<LatestGameResponse>[])
      .map((e) => e.rsp)
      .map((r) => ({
        version: r.version,
        versionMinor: `${semver.major(r.version)}.${semver.minor(r.version)}`,
        randStr: /_([^/]+)\/.+?$/.exec(r.pkg.file_path)?.[1] || '',
      }))
      .sort((a, b) => semver.compare(b.version, a.version));

    for (const platform of platforms) {
      let isLatestWrote = false;
      for (const vInfo of versionInfos) {
        if (!vInfo.randStr) throw new Error('version rand_str not found');
        const rsp = await apiUtils.akEndfield.launcher.latestGameResources(
          target.appCode,
          vInfo.versionMinor,
          vInfo.version,
          vInfo.randStr,
          platform,
          target.region,
        );
        logger.info(
          `Fetched latestGameRes: ${target.region.toUpperCase()}, ${platform}, v${vInfo.version}, ${rsp.res_version}`,
        );

        const prettyRsp = {
          req: {
            appCode: target.appCode,
            gameVersion: vInfo.versionMinor,
            version: vInfo.version,
            randStr: vInfo.randStr,
            platform,
          },
          rsp,
        };

        await saveResultWithHistory(
          ['akEndfield', 'launcher', 'game_resources', String(target.channel), platform],
          vInfo.version,
          prettyRsp,
          {
            saveLatest: !isLatestWrote,
          },
        );
        isLatestWrote = true;
      }
    }
  }
}

async function downloadRawFile(url: string) {
  const urlObj = new URL(url);
  urlObj.search = '';
  const localPath = path.join(
    argvUtils.getArgv()['outputDir'],
    'raw',
    urlObj.hostname,
    ...urlObj.pathname.split('/').filter(Boolean),
  );

  if (await Bun.file(localPath).exists()) return false;

  try {
    const data = await ky
      .get(url, {
        headers: { 'User-Agent': appConfig.network.userAgent.minimum },
        timeout: appConfig.network.timeout,
        retry: { limit: appConfig.network.retryCount },
      })
      .bytes();
    await Bun.write(localPath, data);
    return true;
  } catch (err) {
    if (err instanceof HTTPError && (err.response.status === 404 || err.response.status === 403)) return false;
    throw err;
  }
}

async function fetchAndSaveAllGameResRawData(gameTargets: GameTarget[]) {
  logger.debug('Fetching raw game resources ...');
  const wroteFiles: string[] = [];
  const outputDir = argvUtils.getArgv()['outputDir'];

  const addToQueue = (url: string) => {
    networkQueue.add(async () => {
      if (await downloadRawFile(url)) {
        wroteFiles.push(url);
      }
    });
  };

  // 1. Gather URLs from game resources
  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;
  const filteredTargets = gameTargets.filter(
    (t) => t.channel !== appConfig.network.api.akEndfield.channel.cnWinRelBilibili,
  );
  const uniqueTargets = Array.from(
    new Set(filteredTargets.map((t) => JSON.stringify({ region: t.region, appCode: t.appCode, channel: t.channel }))),
  ).map((s) => JSON.parse(s));

  const resourceUrls = new Set<string>();
  for (const target of uniqueTargets) {
    for (const platform of platforms) {
      const resAllPath = path.join(
        outputDir,
        'akEndfield',
        'launcher',
        'game_resources',
        String(target.channel),
        platform,
        'all.json',
      );
      const file = Bun.file(resAllPath);
      if (!(await file.exists())) continue;

      const resAll = (await file.json()) as StoredData<LatestGameResourcesResponse>[];
      for (const entry of resAll) {
        for (const res of entry.rsp.resources) {
          const fileNames = res.name.includes('main')
            ? ['index_main.json', 'patch.json']
            : res.name.includes('initial')
              ? ['index_initial.json', 'patch.json']
              : ['index_main.json', 'index_initial.json', 'patch.json'];

          for (const fName of fileNames) {
            resourceUrls.add(`${res.path}/${fName}`);
          }
        }
      }
    }
  }
  for (const url of resourceUrls) addToQueue(url);

  // 2. Gather URLs from web APIs
  const webAssetUrls = new Set<string>();
  const webLangs = apiUtils.akEndfield.defaultSettings.launcherWebLang;
  const webConfigs = [
    { dir: 'banner', getUrls: (rsp: any) => rsp.banners?.map((b: any) => b.url) },
    { dir: 'main_bg_image', getUrls: (rsp: any) => [rsp.main_bg_image?.url, rsp.main_bg_image?.video_url] },
    { dir: 'sidebar', getUrls: (rsp: any) => rsp.sidebars?.map((s: any) => s.pic?.url) },
    { dir: 'single_ent', getUrls: (rsp: any) => [rsp.single_ent?.version_url] },
  ];

  for (const target of gameTargets) {
    for (const lang of webLangs) {
      for (const config of webConfigs) {
        const allPath = path.join(
          outputDir,
          'akEndfield',
          'launcher',
          'web',
          String(target.subChannel),
          config.dir,
          lang,
          'all.json',
        );
        const file = Bun.file(allPath);
        if (!(await file.exists())) continue;

        const data = (await file.json()) as StoredData<any>[];
        for (const entry of data) {
          if (!entry.rsp) continue;
          const urls = config.getUrls(entry.rsp);
          for (const url of urls) if (url) webAssetUrls.add(url);
        }
      }
    }
  }
  for (const url of webAssetUrls) addToQueue(url);

  await networkQueue.onIdle();

  // res index decryption
  for (const url of resourceUrls) {
    const urlObj = new URL(url);
    urlObj.search = '';
    if (['index_initial.json', 'index_main.json'].includes(urlObj.pathname.split('/').pop()!) === false) continue;
    const localPath = path.join(
      argvUtils.getArgv()['outputDir'],
      'raw',
      urlObj.hostname,
      ...urlObj.pathname.split('/').filter(Boolean),
    );
    const localPathDec = localPath.replace(/\.json$/, '_dec.json');
    if (!(await Bun.file(localPathDec).exists()) && (await Bun.file(localPath).exists())) {
      const encBytes = new Uint8Array(Buffer.from(await Bun.file(localPath).text(), 'base64'));
      const decBytes = cipher.decryptResIndex(encBytes, appConfig.cipher.akEndfield.resIndexKey);
      await Bun.write(localPathDec, decBytes);
    }
  }

  logger.info(`Fetched raw game resources: ${wroteFiles.length} files`);
}

async function fetchAndSaveLatestLauncher(launcherTargets: LauncherTarget[]) {
  logger.debug('Fetching latestLauncher ...');
  for (const { id, apps, code, channel } of launcherTargets) {
    for (const app of apps) {
      const apiArgs = [code, channel, channel, null] as const;
      const [rsp, rspExe] = await Promise.all([
        apiUtils.akEndfield.launcher.latestLauncher(...apiArgs, app, id),
        apiUtils.akEndfield.launcher.latestLauncherExe(...apiArgs, app.toLowerCase(), id),
      ]);

      logger.info(`Fetched latestLauncher: ${id.toUpperCase()}, v${rsp.version}, ${app}`);
      const channelStr = String(channel);
      queueAssetForMirroring(rsp.zip_package_url);
      queueAssetForMirroring(rspExe.exe_url);

      await saveResultWithHistory(
        ['akEndfield', 'launcher', 'launcher', app, channelStr],
        rsp.version,
        {
          req: { appCode: code, channel, subChannel: channel, targetApp: app },
          rsp,
        },
        { ignoreRules: diffIgnoreRules },
      );

      await saveResultWithHistory(
        ['akEndfield', 'launcher', 'launcherExe', app, channelStr],
        rspExe.version,
        {
          req: { appCode: code, channel, subChannel: channel, ta: app.toLowerCase() },
          rsp: rspExe,
        },
        { ignoreRules: diffIgnoreRules },
      );
    }
  }
}

async function fetchAndSaveLatestWebApis(gameTargets: GameTarget[]) {
  logger.debug('Fetching latestWebApis ...');
  const langs = apiUtils.akEndfield.defaultSettings.launcherWebLang;
  const langsCN = apiUtils.akEndfield.defaultSettings.launcherWebLangCN;
  const apis = [
    { name: 'sidebar', method: apiUtils.akEndfield.launcherWeb.sidebar, dir: 'sidebar' },
    { name: 'singleEnt', method: apiUtils.akEndfield.launcherWeb.singleEnt, dir: 'single_ent' },
    { name: 'mainBgImage', method: apiUtils.akEndfield.launcherWeb.mainBgImage, dir: 'main_bg_image' },
    { name: 'banner', method: apiUtils.akEndfield.launcherWeb.banner, dir: 'banner' },
    { name: 'announcement', method: apiUtils.akEndfield.launcherWeb.announcement, dir: 'announcement' },
    { name: 'urlConfig', method: apiUtils.akEndfield.launcherWeb.urlConfig, dir: 'url_config' },
  ] as const;

  for (const target of gameTargets) {
    for (const lang of target.region === 'cn' ? langsCN : langs) {
      for (const api of apis) {
        networkQueue.add(async () => {
          const rsp = await api.method(target.appCode, target.channel, target.subChannel, lang, target.region);
          if (!rsp) return;
          const prettyRsp = {
            req: {
              appCode: target.appCode,
              channel: target.channel,
              subChannel: target.subChannel,
              lang,
              region: target.region,
              platform: 'Windows',
            },
            rsp,
          };
          await saveResultWithHistory(
            ['akEndfield', 'launcher', 'web', String(target.subChannel), api.dir, lang],
            null,
            prettyRsp,
            { ignoreRules: diffIgnoreRules },
          );
        });
      }
    }
  }
  await networkQueue.onIdle();
}

async function fetchAndSaveLauncherProtocol(gameTargets: GameTarget[]) {
  logger.debug('Fetching launcherProtocol ...');
  const langs = apiUtils.akEndfield.defaultSettings.launcherWebLang;
  const langsCN = apiUtils.akEndfield.defaultSettings.launcherWebLangCN;
  const filterChannel = [
    appConfig.network.api.akEndfield.subChannel.cnWinRel,
    appConfig.network.api.akEndfield.subChannel.osWinRel,
    appConfig.network.api.akEndfield.subChannel.osWinRelEpic,
  ];
  for (const target of gameTargets.filter((e) => filterChannel.includes(e.launcherSubChannel))) {
    for (const lang of target.region === 'cn' ? langsCN : langs) {
      networkQueue.add(async () => {
        const rsp = await apiUtils.akEndfield.launcher.protocol(
          target.launcherAppCode,
          target.channel,
          target.subChannel,
          lang,
          target.region,
          '',
        );
        if (!rsp) return;
        logger.trace(`Found protocol: ${rsp.dataVersion}, ${target.region.toUpperCase()}, ${target.name}, ${lang}`);
        const prettyRsp = {
          req: {
            appCode: target.launcherAppCode,
            channel: target.channel,
            subChannel: target.subChannel,
            language: lang,
            dataVersion: '',
          },
          rsp,
        };
        await saveResultWithHistory(
          ['akEndfield', 'launcher', 'protocol', String(target.subChannel), lang],
          null,
          prettyRsp,
          { ignoreRules: diffIgnoreRules },
        );
      });
    }
  }
  await networkQueue.onIdle();
}

async function addAllGameResVFSDataToPending(gameTargets: GameTarget[]) {
  const outputDir = argvUtils.getArgv()['outputDir'];
  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;
  const filteredTargets = gameTargets.filter(
    (t) => t.channel !== appConfig.network.api.akEndfield.channel.cnWinRelBilibili,
  );
  const uniqueTargets = [...new Set(filteredTargets.map((t) => t.channel))];

  const dbPath = path.join(outputDir, 'mirror_file_res_list.json.zst');
  const patchDbPath = path.join(outputDir, 'mirror_file_res_patch_list.json.zst');
  const pendingDbPath = path.join(outputDir, 'mirror_file_res_list_pending.json');
  const pendingPatchDbPath = path.join(outputDir, 'mirror_file_res_patch_list_pending.json');
  if (!(await Bun.file(dbPath).exists())) await Bun.write(dbPath, Bun.zstdCompressSync('[]'));
  if (!(await Bun.file(patchDbPath).exists())) await Bun.write(patchDbPath, Bun.zstdCompressSync('[]'));
  if (!(await Bun.file(pendingDbPath).exists())) await Bun.write(pendingDbPath, '[]');
  if (!(await Bun.file(pendingPatchDbPath).exists())) await Bun.write(pendingPatchDbPath, '[]');
  const db: MirrorFileResEntry[] = JSON.parse(Bun.zstdDecompressSync(await Bun.file(dbPath).bytes()).toString('utf-8'));
  const patchDb: MirrorFileResPatchEntry[] = JSON.parse(
    Bun.zstdDecompressSync(await Bun.file(patchDbPath).bytes()).toString('utf-8'),
  );
  const pendingDb: AssetToMirrorRes[] = await Bun.file(pendingDbPath).json();
  const pendingPatchDb: AssetToMirrorResPatch[] = await Bun.file(pendingPatchDbPath).json();

  for (const channel of uniqueTargets) {
    for (const platform of platforms) {
      const apiResAllPath = path.join(
        outputDir,
        'akEndfield',
        'launcher',
        'game_resources',
        String(channel),
        platform,
        'all.json',
      );
      if (!(await Bun.file(apiResAllPath).exists())) continue;
      const apiResAll = ((await Bun.file(apiResAllPath).json()) as StoredData<LatestGameResourcesResponse>[])
        .map((e) => e.rsp.resources)
        .flat();
      for (const apiResEntry of apiResAll) {
        const indexJsonPath = path.join(
          outputDir,
          'raw',
          apiResEntry.path.replace('https://', ''),
          'index_' + apiResEntry.name + '_dec.json',
        );
        if (!(await Bun.file(indexJsonPath).exists())) continue;
        const indexJson: IResEndfield.ResourceIndex = await Bun.file(indexJsonPath).json();
        for (const resFile of indexJson.files) {
          if (db.some((e) => e.md5 === resFile.md5)) continue;
          if (pendingDb.some((e) => e.md5 === resFile.md5)) continue;
          pendingDb.push({
            md5: resFile.md5,
            name: `VFS_${apiResEntry.version}_${resFile.md5}.${path.extname(resFile.name).slice(1)}`,
            size: resFile.size,
            url: `${apiResEntry.path}/${resFile.name}`,
          });
        }

        const patchJsonPath = path.join(outputDir, 'raw', apiResEntry.path.replace('https://', ''), 'patch.json');
        if (!(await Bun.file(patchJsonPath).exists())) continue;
        const patchJson: IResEndfield.ResourcePatch = await Bun.file(patchJsonPath).json();
        for (const file of patchJson.files) {
          const md5New = file.md5;
          for (const patch of file.patch.toReversed()) {
            const md5Old = patch.base_md5;
            const size = patch.patch_size;
            const url = `${apiResEntry.path}/Patch/${patch.patch}`;
            if (patchDb.some((e) => e.md5Old === md5Old && e.md5New === md5New)) continue;
            if (pendingPatchDb.some((e) => e.md5Old === md5Old && e.md5New === md5New)) continue;
            pendingPatchDb.push({ md5Old, md5New, size, url });
          }
        }
      }
    }
  }

  await Bun.write(pendingDbPath, JSON.stringify(pendingDb, null, 2));
  await Bun.write(pendingPatchDbPath, JSON.stringify(pendingPatchDb, null, 2));
}

async function mainCmdHandler() {
  const cfg = appConfig.network.api.akEndfield;
  const gameTargets: GameTarget[] = [
    {
      name: 'Official',
      region: 'os',
      appCode: cfg.appCode.game.osWinRel,
      launcherAppCode: cfg.appCode.launcher.osWinRel,
      channel: cfg.channel.osWinRel,
      subChannel: cfg.subChannel.osWinRel,
      launcherSubChannel: cfg.subChannel.osWinRel,
      dirName: String(cfg.channel.osWinRel),
    },
    {
      name: 'Epic',
      region: 'os',
      appCode: cfg.appCode.game.osWinRel,
      launcherAppCode: cfg.appCode.launcher.osWinRelEpic,
      channel: cfg.channel.osWinRel,
      subChannel: cfg.subChannel.osWinRelEpic,
      launcherSubChannel: cfg.subChannel.osWinRelEpic,
      dirName: String(cfg.subChannel.osWinRelEpic),
    },
    {
      name: 'Google Play',
      region: 'os',
      appCode: cfg.appCode.game.osWinRel,
      launcherAppCode: cfg.appCode.launcher.osWinRelEpic,
      channel: cfg.channel.osWinRel,
      subChannel: cfg.subChannel.osWinRelGooglePlay,
      launcherSubChannel: cfg.subChannel.osWinRelGooglePlay,
      dirName: String(cfg.subChannel.osWinRelGooglePlay),
    },
    {
      name: 'Official',
      region: 'cn',
      appCode: cfg.appCode.game.cnWinRel,
      launcherAppCode: cfg.appCode.launcher.cnWinRel,
      channel: cfg.channel.cnWinRel,
      subChannel: cfg.subChannel.cnWinRel,
      launcherSubChannel: cfg.subChannel.cnWinRel,
      dirName: String(cfg.channel.cnWinRel),
    },
    {
      name: 'Bilibili',
      region: 'cn',
      appCode: cfg.appCode.game.cnWinRel,
      launcherAppCode: cfg.appCode.launcher.cnWinRel,
      channel: cfg.channel.cnWinRelBilibili,
      subChannel: cfg.subChannel.cnWinRelBilibili,
      launcherSubChannel: cfg.subChannel.cnWinRelBilibili,
      dirName: String(cfg.channel.cnWinRelBilibili),
    },
  ];

  const launcherTargets: LauncherTarget[] = [
    { id: 'os', apps: ['EndField', 'Official'], code: cfg.appCode.launcher.osWinRel, channel: cfg.channel.osWinRel },
    {
      id: 'cn',
      apps: ['EndField', 'Arknights', 'Official'],
      code: cfg.appCode.launcher.cnWinRel,
      channel: cfg.channel.cnWinRel,
    },
  ];

  await fetchAndSaveLatestGames(gameTargets);
  await fetchAndSaveLatestGamePatches(gameTargets);
  await fetchAndSaveLatestGameResources(gameTargets);
  await fetchAndSaveLatestWebApis(gameTargets);
  await fetchAndSaveLauncherProtocol(gameTargets);
  await fetchAndSaveLatestLauncher(launcherTargets);
  await fetchAndSaveAllGameResRawData(gameTargets);
  await addAllGameResVFSDataToPending(gameTargets);

  const outputDir = argvUtils.getArgv()['outputDir'];
  const pendingPath = path.join(outputDir, 'mirror_file_list_pending.json');
  const dbPath = path.join(outputDir, 'mirror_file_list.json');

  let pendingData: AssetToMirror[] = [];
  if (await Bun.file(pendingPath).exists()) {
    pendingData = await Bun.file(pendingPath).json();
  }
  const db: MirrorFileEntry[] = (await Bun.file(dbPath).exists()) ? await Bun.file(dbPath).json() : [];
  let addedCount = 0;

  const uniqueAssetsToMirror = assetsToMirror.filter(
    (asset, index, self) => index === self.findIndex((t) => t.url === asset.url),
  );

  for (const asset of uniqueAssetsToMirror) {
    const origUrl = stringUtils.removeQueryStr(asset.url);
    const dbExists = db.some((e) => e.orig.includes(origUrl));
    const pendingExists = pendingData.some((e) => stringUtils.removeQueryStr(e.url) === origUrl);
    if (!dbExists && !pendingExists) {
      pendingData.push(asset);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    logger.info(`Saved ${addedCount} new assets to mirror pending list`);
    await Bun.write(pendingPath, JSON.stringify(pendingData, null, 2));
  }
}

export default mainCmdHandler;
