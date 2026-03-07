import path from 'node:path';
import { Octokit } from '@octokit/rest';
import ky, { HTTPError } from 'ky';
import { DateTime } from 'luxon';
import PQueue from 'p-queue';
import semver from 'semver';
import YAML from 'yaml';
import apiUtils from '../utils/api/index.js';
import argvUtils from '../utils/argv.js';
import appConfig from '../utils/config.js';
import githubUtils from '../utils/github.js';
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

interface MirrorFileEntry {
  orig: string;
  mirror: string;
  origStatus: boolean;
}

interface AssetToMirror {
  url: string;
  name: string | null;
}

// Global/Shared State
let githubAuthCfg: any = null;
let octoClient: Octokit | null = null;
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
            queueAssetForMirroring(
              rsp.patch.url,
              new URL(rsp.patch.url).pathname.split('/').filter(Boolean).slice(-3).join('_'),
            );
            rsp.patch.patches.forEach((e) => queueAssetForMirroring(e.url));
          }
        }
      });
    }

    await networkQueue.onIdle();

    if (needWrite) {
      await Bun.write(patchAllPath, JSON.stringify(patchAll, null, 2));
    }
  }
}

async function fetchAndSaveLatestGameResources(gameTargets: GameTarget[]) {
  logger.debug('Fetching latestGameRes ...');
  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;
  const subChns = appConfig.network.api.akEndfield.subChannel;

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

async function fetchAndSaveAllGameResRawData(gameTargets: GameTarget[]) {
  logger.debug('Fetching raw game resources ...');
  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;
  const filteredTargets = gameTargets.filter(
    (t) => t.channel !== appConfig.network.api.akEndfield.channel.cnWinRelBilibili,
  );
  const uniqueTargets = Array.from(
    new Set(filteredTargets.map((t) => JSON.stringify({ region: t.region, appCode: t.appCode, channel: t.channel }))),
  ).map((s) => JSON.parse(s));

  const needDlRaw: { name: string; version: string; path: string }[] = [];
  for (const target of uniqueTargets) {
    for (const platform of platforms) {
      const resAllPath = path.join(
        argvUtils.getArgv()['outputDir'],
        'akEndfield',
        'launcher',
        'game_resources',
        String(target.channel),
        platform,
        'all.json',
      );
      if (await Bun.file(resAllPath).exists()) {
        const resAll = (await Bun.file(resAllPath).json()) as StoredData<LatestGameResourcesResponse>[];
        resAll.forEach((e) => needDlRaw.push(...e.rsp.resources));
      }
    }
  }

  const uniqueRaw = [...new Map(needDlRaw.map((item) => [item.path, item])).values()];
  const wroteFiles: string[] = [];

  for (const raw of uniqueRaw) {
    const fileNames = raw.name.includes('main')
      ? ['index_main.json', 'patch.json']
      : raw.name.includes('initial')
        ? ['index_initial.json', 'patch.json']
        : ['index_main.json', 'index_initial.json', 'patch.json'];

    for (const fName of fileNames) {
      networkQueue.add(async () => {
        const urlObj = new URL(`${raw.path}/${fName}`);
        urlObj.search = '';
        const localPath = path.join(
          argvUtils.getArgv()['outputDir'],
          'raw',
          urlObj.hostname,
          ...urlObj.pathname.split('/').filter(Boolean),
        );

        if (!(await Bun.file(localPath).exists())) {
          try {
            const rsp = await ky
              .get(urlObj.href, {
                headers: { 'User-Agent': appConfig.network.userAgent.minimum },
                timeout: appConfig.network.timeout,
                retry: { limit: appConfig.network.retryCount },
              })
              .bytes();
            await Bun.write(localPath, rsp);
            wroteFiles.push(localPath);
          } catch (err) {
            if (!(err instanceof HTTPError && (err.response.status === 404 || err.response.status === 403))) throw err;
          }
        }
      });
    }
  }

  {
    const urlSet: Set<string> = new Set();
    const infileBasePath: string = path.join(argvUtils.getArgv()['outputDir'], 'akEndfield', 'launcher', 'web');
    for (const target of gameTargets) {
      for (const lang of apiUtils.akEndfield.defaultSettings.launcherWebLang) {
        {
          const allPath = path.join(infileBasePath, String(target.subChannel), 'banner', lang, 'all.json');
          if (await Bun.file(allPath).exists()) {
            const data: StoredData<Awaited<ReturnType<typeof apiUtils.akEndfield.launcherWeb.banner>>>[] =
              await Bun.file(allPath).json();
            for (const dataEntry of data) {
              if (!dataEntry.rsp) continue;
              dataEntry.rsp.banners.forEach((e) => urlSet.add(e.url));
            }
          }
        }
        {
          const allPath = path.join(infileBasePath, String(target.subChannel), 'main_bg_image', lang, 'all.json');
          if (await Bun.file(allPath).exists()) {
            const data: StoredData<Awaited<ReturnType<typeof apiUtils.akEndfield.launcherWeb.mainBgImage>>>[] =
              await Bun.file(allPath).json();
            for (const dataEntry of data) {
              if (!dataEntry.rsp) continue;
              urlSet.add(dataEntry.rsp.main_bg_image.url);
              if (dataEntry.rsp.main_bg_image.video_url) urlSet.add(dataEntry.rsp.main_bg_image.video_url);
            }
          }
        }
        {
          const allPath = path.join(infileBasePath, String(target.subChannel), 'sidebar', lang, 'all.json');
          if (await Bun.file(allPath).exists()) {
            const data: StoredData<Awaited<ReturnType<typeof apiUtils.akEndfield.launcherWeb.sidebar>>>[] =
              await Bun.file(allPath).json();
            for (const dataEntry of data) {
              if (!dataEntry.rsp) continue;
              dataEntry.rsp.sidebars.forEach((e) => {
                if (e.pic !== null && e.pic.url) urlSet.add(e.pic.url);
              });
            }
          }
        }
        {
          const allPath = path.join(infileBasePath, String(target.subChannel), 'single_ent', lang, 'all.json');
          if (await Bun.file(allPath).exists()) {
            const data: StoredData<Awaited<ReturnType<typeof apiUtils.akEndfield.launcherWeb.singleEnt>>>[] =
              await Bun.file(allPath).json();
            for (const dataEntry of data) {
              if (!dataEntry.rsp) continue;
              [dataEntry.rsp.single_ent.version_url].forEach((e) => {
                if (e) urlSet.add(e);
              });
            }
          }
        }
      }
    }

    for (const url of [...urlSet]) {
      networkQueue.add(async () => {
        const urlObj = new URL(url);
        urlObj.search = '';
        const localPath = path.join(
          argvUtils.getArgv()['outputDir'],
          'raw',
          urlObj.hostname,
          ...urlObj.pathname.split('/').filter(Boolean),
        );

        if (!(await Bun.file(localPath).exists())) {
          try {
            const rsp = await ky
              .get(urlObj.href, {
                headers: { 'User-Agent': appConfig.network.userAgent.minimum },
                timeout: appConfig.network.timeout,
                retry: { limit: appConfig.network.retryCount },
              })
              .bytes();
            await Bun.write(localPath, rsp);
            wroteFiles.push(localPath);
          } catch (err) {
            if (!(err instanceof HTTPError && (err.response.status === 404 || err.response.status === 403))) throw err;
          }
        }
      });
    }
  }

  await networkQueue.onIdle();
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
  const apis = [
    { name: 'sidebar', method: apiUtils.akEndfield.launcherWeb.sidebar, dir: 'sidebar' },
    { name: 'singleEnt', method: apiUtils.akEndfield.launcherWeb.singleEnt, dir: 'single_ent' },
    { name: 'mainBgImage', method: apiUtils.akEndfield.launcherWeb.mainBgImage, dir: 'main_bg_image' },
    { name: 'banner', method: apiUtils.akEndfield.launcherWeb.banner, dir: 'banner' },
    { name: 'announcement', method: apiUtils.akEndfield.launcherWeb.announcement, dir: 'announcement' },
  ] as const;

  for (const target of gameTargets) {
    for (const lang of langs) {
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

// Mirroring and Cleanup
async function checkMirrorFileDbStatus() {
  logger.info('Checking mirrored files availability ...');
  const dbPath = path.join(argvUtils.getArgv()['outputDir'], 'mirror_file_list.json');
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
  await Bun.write(dbPath, JSON.stringify(db));
}

async function processMirrorQueue() {
  const dbPath = path.join(argvUtils.getArgv()['outputDir'], 'mirror_file_list.json');
  const db = (await Bun.file(dbPath).json()) as MirrorFileEntry[];

  for (const { url, name } of assetsToMirror) {
    const origUrl = stringUtils.removeQueryStr(url);
    if (!db.find((e) => e.orig.includes(origUrl))) {
      await githubUtils.uploadAsset(octoClient, githubAuthCfg, url, name);
      if (githubAuthCfg) {
        db.push({
          orig: origUrl,
          mirror: `https://github.com/${githubAuthCfg.github.relArchive.owner}/${githubAuthCfg.github.relArchive.repo}/releases/download/${githubAuthCfg.github.relArchive.tag}/${name ?? new URL(url).pathname.split('/').pop() ?? ''}`,
          origStatus: true,
        });
        await Bun.write(dbPath, JSON.stringify(db));
      }
    }
  }
}

async function mainCmdHandler() {
  const authPath = 'config/config_auth.yaml';
  if (await Bun.file(authPath).exists()) {
    githubAuthCfg = YAML.parse(await Bun.file(authPath).text());
    logger.info('Logging in to GitHub');
    octoClient = new Octokit({ auth: githubAuthCfg.github.relArchive.token });
  }

  if (await githubUtils.checkIsActionRunning(githubAuthCfg)) {
    logger.error('Duplicate execution detected');
    return;
  }

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
  await fetchAndSaveAllGameResRawData(gameTargets);
  await fetchAndSaveLatestLauncher(launcherTargets);
  await fetchAndSaveLatestWebApis(gameTargets);

  await checkMirrorFileDbStatus();
  await processMirrorQueue();

  const relInfo = await githubUtils.getReleaseInfo(octoClient, githubAuthCfg);
  if (relInfo) {
    logger.info(`GitHub Releases total size: ${formatBytes(mathUtils.arrayTotal(relInfo.assets.map((a) => a.size)))}`);
  }
}

export default mainCmdHandler;
