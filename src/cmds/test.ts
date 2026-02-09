import path from 'node:path';
import { DateTime } from 'luxon';
import PQueue from 'p-queue';
import semver from 'semver';
import apiUtils from '../utils/api/index.js';
import argvUtils from '../utils/argv.js';
import appConfig from '../utils/config.js';
import logger from '../utils/logger.js';
import mathUtils from '../utils/math.js';

const formatBytes = (size: number) =>
  mathUtils.formatFileSize(size, {
    decimals: 2,
    decimalPadding: true,
    unitVisible: true,
    useBinaryUnit: true,
    useBitUnit: false,
    unit: null,
  });

type LatestGameResponse = Awaited<ReturnType<typeof apiUtils.akEndfield.launcher.latestGame>>;
type LatestGameResourcesResponse = Awaited<ReturnType<typeof apiUtils.akEndfield.launcher.latestGameResources>>;
// type LatestLauncherResponse = Awaited<ReturnType<typeof apiUtils.akEndfield.launcher.latestLauncher>>;

interface StoredData<T> {
  req: any;
  rsp: T;
  updatedAt: string;
}

interface GameTarget {
  name: string;
  launcherAppCode: string;
  subChannel: number;
  launcherSubChannel: number;
  dirName: string;
}

function getObjectDiff(obj1: any, obj2: any) {
  const diff: any = {};
  const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
  for (const key of keys) {
    const val1 = obj1?.[key];
    const val2 = obj2?.[key];
    if (JSON.stringify(val1) !== JSON.stringify(val2)) {
      if (typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null) {
        const nestedDiff = getObjectDiff(val1, val2);
        if (Object.keys(nestedDiff).length > 0) {
          diff[key] = nestedDiff;
        }
      } else {
        diff[key] = { old: val1, new: val2 };
      }
    }
  }
  return diff;
}

async function saveResult<T>(
  subPaths: string[],
  version: string,
  data: { req: any; rsp: T },
  saveLatest: boolean = true,
) {
  const outputDir = argvUtils.getArgv()['outputDir'];
  const filePathBase = path.join(outputDir, ...subPaths);

  const filesToCheck = [path.join(filePathBase, `v${version}.json`)];
  if (saveLatest) {
    filesToCheck.push(path.join(filePathBase, 'latest.json'));
  }

  const dataStr = JSON.stringify(data, null, 2);
  const dataMinified = JSON.stringify(data);

  for (const filePath of filesToCheck) {
    const file = Bun.file(filePath);
    const exists = await file.exists();
    let currentData: any = null;
    if (exists) {
      currentData = await file.json();
    }
    if (!exists || JSON.stringify(currentData) !== dataMinified) {
      if (exists) {
        logger.trace(`Diff detected in ${filePath}:`, JSON.stringify(getObjectDiff(currentData, data), null, 2));
      }
      await Bun.write(filePath, dataStr);
    }
  }

  const allFilePath = path.join(filePathBase, 'all.json');
  const allFile = Bun.file(allFilePath);
  let allData: StoredData<T>[] = [];
  if (await allFile.exists()) {
    allData = await allFile.json();
  }

  const exists = allData.some((e) => JSON.stringify({ req: e.req, rsp: e.rsp }) === dataMinified);

  if (!exists) {
    allData.push({ updatedAt: DateTime.now().toISO(), ...data });
    await Bun.write(allFilePath, JSON.stringify(allData, null, 2));
  }
}

async function generateGameListMd(target: GameTarget) {
  const outputDir = argvUtils.getArgv()['outputDir'];
  const gameAllJsonPath = path.join(outputDir, 'akEndfield', 'launcher', 'game', target.dirName, 'all.json');

  if (!(await Bun.file(gameAllJsonPath).exists())) return;

  const gameAllJson = (await Bun.file(gameAllJsonPath).json()) as StoredData<LatestGameResponse>[];
  const mdTexts: string[] = [];

  mdTexts.push(`# Game Packages (${target.name})\n`);

  // TOC
  for (const e of gameAllJson) {
    const version = e.rsp.version;
    const date = DateTime.fromISO(e.updatedAt, { setZone: true }).setZone('UTC+8');
    const dateStr = date.toFormat('yyyy/MM/dd HH:mm:ss');
    const anchorId = `ver-${version}-${Math.ceil(date.toSeconds())}`;
    mdTexts.push(`- [${version} (${dateStr})](#${anchorId})`);
  }
  mdTexts.push('');

  // Content
  for (const e of gameAllJson) {
    const version = e.rsp.version;
    const date = DateTime.fromISO(e.updatedAt, { setZone: true }).setZone('UTC+8');
    const dateStr = date.toFormat('yyyy/MM/dd HH:mm:ss');
    const anchorId = `ver-${version}-${Math.ceil(date.toSeconds())}`;

    const packedSize = mathUtils.arrayTotal(e.rsp.pkg.packs.map((f) => parseInt(f.package_size)));
    const unpackedSize = parseInt(e.rsp.pkg.total_size) - packedSize;

    mdTexts.push(
      `<h2 id="${anchorId}">${version} (${dateStr})</h2>\n`,
      `<table>`,
      `  <tr><td>Unpacked Size</td><td style="text-align: right;"><b>${formatBytes(unpackedSize)}</b></td></tr>`,
      `  <tr><td>Packed Size</td><td style="text-align: right;"><b>${formatBytes(packedSize)}</b></td></tr>`,
      `</table>\n`,
      `|File|MD5 Checksum|Size|`,
      `|:--|:--|--:|`,
    );

    for (const f of e.rsp.pkg.packs) {
      const fileName = new URL(f.url).pathname.split('/').pop() ?? '';
      mdTexts.push(`|[${fileName}](${f.url})|\`${f.md5}\`|${formatBytes(parseInt(f.package_size))}|`);
    }
    mdTexts.push('');
  }

  await Bun.write(
    path.join(outputDir, 'akEndfield', 'launcher', 'game', target.dirName, 'list.md'),
    mdTexts.join('\n'),
  );
}

async function generatePatchListMd(target: GameTarget) {
  const outputDir = argvUtils.getArgv()['outputDir'];
  const patchAllJsonPath = path.join(outputDir, 'akEndfield', 'launcher', 'game', target.dirName, 'all_patch.json');

  if (!(await Bun.file(patchAllJsonPath).exists())) return;

  const patchAllJson = (await Bun.file(patchAllJsonPath).json()) as StoredData<LatestGameResponse>[];
  const mdTexts: string[] = [];

  mdTexts.push(`# Game Patch Packages (${target.name})\n`);

  // TOC
  for (const e of patchAllJson) {
    if (!e.rsp.patch) continue;
    const version = e.rsp.version;
    const reqVersion = e.rsp.request_version;
    const date = DateTime.fromISO(e.updatedAt, { setZone: true }).setZone('UTC+8');
    const dateStr = date.toFormat('yyyy/MM/dd HH:mm:ss');
    const anchorId = `ver-${reqVersion}-${version}-${Math.ceil(date.toSeconds())}`;
    mdTexts.push(`- [${reqVersion} → ${version} (${dateStr})](#${anchorId})`);
  }
  mdTexts.push('');

  // Content
  for (const e of patchAllJson) {
    if (!e.rsp.patch) continue;

    const version = e.rsp.version;
    const reqVersion = e.rsp.request_version;
    const date = DateTime.fromISO(e.updatedAt, { setZone: true }).setZone('UTC+8');
    const dateStr = date.toFormat('yyyy/MM/dd HH:mm:ss');
    const anchorId = `ver-${reqVersion}-${version}-${Math.ceil(date.toSeconds())}`;

    const packedSize = mathUtils.arrayTotal(e.rsp.patch.patches.map((f) => parseInt(f.package_size)));
    const unpackedSize = parseInt(e.rsp.patch.total_size) - packedSize;

    mdTexts.push(
      `<h2 id="${anchorId}">${reqVersion} → ${version} (${dateStr})</h2>\n`,
      `<table>`,
      `  <tr><td>Unpacked Size</td><td style="text-align: right;"><b>${formatBytes(unpackedSize)}</b></td></tr>`,
      `  <tr><td>Packed Size</td><td style="text-align: right;"><b>${formatBytes(packedSize)}</b></td></tr>`,
      `</table>\n`,
      `|File|MD5 Checksum|Size|`,
      `|:--|:--|--:|`,
    );

    if (e.rsp.patch.url) {
      const fileName = new URL(e.rsp.patch.url).pathname.split('/').pop() ?? '';
      mdTexts.push(
        `|[${fileName}](${e.rsp.patch.url})|\`${e.rsp.patch.md5}\`|${formatBytes(parseInt(e.rsp.patch.package_size))}|`,
      );
    }

    for (const f of e.rsp.patch.patches) {
      const fileName = new URL(f.url).pathname.split('/').pop() ?? '';
      mdTexts.push(`|[${fileName}](${f.url})|\`${f.md5}\`|${formatBytes(parseInt(f.package_size))}|`);
    }
    mdTexts.push('');
  }

  await Bun.write(
    path.join(outputDir, 'akEndfield', 'launcher', 'game', target.dirName, 'list_patch.md'),
    mdTexts.join('\n'),
  );
}

async function generateResourceListMd(channelStr: string) {
  const outputDir = argvUtils.getArgv()['outputDir'];
  const mdTexts: string[] = [];
  mdTexts.push(
    '# Game Resources\n',
    '- [Windows](#res-Windows)',
    '- [Android](#res-Android)',
    '- [iOS](#res-iOS)',
    '- [PlayStation](#res-PlayStation)\n',
  );

  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;

  for (const platform of platforms) {
    const resourceAllJsonPath = path.join(
      outputDir,
      'akEndfield',
      'launcher',
      'game_resources',
      channelStr,
      platform,
      'all.json',
    );

    if (!(await Bun.file(resourceAllJsonPath).exists())) continue;

    const gameAllJson = (await Bun.file(resourceAllJsonPath).json()) as StoredData<LatestGameResourcesResponse>[];
    const resVersionMap = new Map<string, { rsp: StoredData<LatestGameResourcesResponse>; versions: Set<string> }>();
    for (const e of gameAllJson) {
      const resVer = e.rsp.res_version;
      if (!resVersionMap.has(resVer)) {
        resVersionMap.set(resVer, { rsp: e, versions: new Set() });
      }
      resVersionMap.get(resVer)!.versions.add(e.req.version);
    }

    const resVersionSet = Array.from(resVersionMap.values()).map((data) => ({
      resVersion: data.rsp.rsp.res_version,
      rsp: data.rsp,
      versions: Array.from(data.versions),
    }));

    mdTexts.push(
      `<h2 id="res-${platform}">${platform}</h2>\n`,
      '|Res version|Initial|Main|Game version|',
      '|--|--|--|--|',
      ...resVersionSet.map(
        (resVerObj) =>
          `|\`${resVerObj.rsp.rsp.res_version}\`|[${resVerObj.rsp.rsp.resources.find((e) => e.name === 'initial')!.version}](${resVerObj.rsp.rsp.resources.find((e) => e.name === 'initial')!.path})|[${resVerObj.rsp.rsp.resources.find((e) => e.name === 'main')!.version}](${resVerObj.rsp.rsp.resources.find((e) => e.name === 'main')!.path})|${resVerObj.versions.sort((a, b) => semver.compare(b, a)).join(', ')}|`,
      ),
      '',
    );
  }

  await Bun.write(
    path.join(outputDir, 'akEndfield', 'launcher', 'game_resources', channelStr, 'list.md'),
    mdTexts.join('\n'),
  );
}

async function fetchAndSaveLatestGames(cfg: any, gameTargets: GameTarget[]) {
  for (const target of gameTargets) {
    logger.debug(`Fetching latestGame (${target.name}) ...`);
    const rsp = await apiUtils.akEndfield.launcher.latestGame(
      cfg.appCode.game.osWinRel,
      target.launcherAppCode,
      cfg.channel.osWinRel,
      target.subChannel,
      target.launcherSubChannel,
      null,
    );
    logger.info(
      `Fetched latestGame (${target.name}): v${rsp.version}, ${mathUtils.formatFileSize(
        parseInt(rsp.pkg.total_size) - mathUtils.arrayTotal(rsp.pkg.packs.map((e) => parseInt(e.package_size))),
        {
          decimals: 2,
          decimalPadding: true,
          useBinaryUnit: true,
          useBitUnit: false,
          unitVisible: true,
          unit: null,
        },
      )}`,
    );
    const prettyRsp = {
      req: {
        appCode: cfg.appCode.game.osWinRel,
        launcherAppCode: target.launcherAppCode,
        channel: cfg.channel.osWinRel,
        subChannel: target.subChannel,
        launcherSubChannel: target.launcherSubChannel,
      },
      rsp,
    };

    await saveResult(['akEndfield', 'launcher', 'game', target.dirName], rsp.version, prettyRsp);
  }
}

async function fetchAndSaveLatestGamePatches(cfg: any, gameTargets: GameTarget[]) {
  for (const target of gameTargets) {
    logger.debug(`Fetching latestGame (patch) (${target.name}) ...`);
    const gameAllJsonPath = path.join(
      argvUtils.getArgv()['outputDir'],
      'akEndfield',
      'launcher',
      'game',
      target.dirName,
      'all.json',
    );
    const patchAllJsonPath = path.join(
      argvUtils.getArgv()['outputDir'],
      'akEndfield',
      'launcher',
      'game',
      target.dirName,
      'all_patch.json',
    );

    if (!(await Bun.file(gameAllJsonPath).exists())) continue;

    const gameAllJson = (await Bun.file(gameAllJsonPath).json()) as StoredData<LatestGameResponse>[];
    let patchAllJson: StoredData<LatestGameResponse>[] = [];
    if (await Bun.file(patchAllJsonPath).exists()) {
      patchAllJson = await Bun.file(patchAllJsonPath).json();
    }

    const versionList = ([...new Set(gameAllJson.map((e) => e.rsp.version))] as string[])
      .sort((a, b) => semver.compare(b, a))
      .slice(1);
    let needWrite: boolean = false;
    const queue = new PQueue({ concurrency: appConfig.threadCount.network });
    for (const ver of versionList) {
      queue.add(async () => {
        const rsp = await apiUtils.akEndfield.launcher.latestGame(
          cfg.appCode.game.osWinRel,
          target.launcherAppCode,
          cfg.channel.osWinRel,
          target.subChannel,
          target.launcherSubChannel,
          ver,
        );
        const prettyRsp = {
          req: {
            appCode: cfg.appCode.game.osWinRel,
            launcherAppCode: target.launcherAppCode,
            channel: cfg.channel.osWinRel,
            subChannel: target.subChannel,
            launcherSubChannel: target.launcherSubChannel,
            version: ver,
          },
          rsp,
        };
        if (rsp.patch === null) return;
        const prettyRspStr = JSON.stringify(prettyRsp);
        if (!patchAllJson.some((e) => JSON.stringify({ req: e.req, rsp: e.rsp }) === prettyRspStr)) {
          logger.debug(
            `Fetched latestGame (patch) (${target.name}): v${rsp.request_version} -> v${rsp.version}, ${mathUtils.formatFileSize(
              parseInt(rsp.patch.total_size) - parseInt(rsp.patch.package_size),
              {
                decimals: 2,
                decimalPadding: true,
                unitVisible: true,
                useBinaryUnit: true,
                useBitUnit: false,
                unit: null,
              },
            )}`,
          );
          patchAllJson.push({
            updatedAt: DateTime.now().toISO(),
            ...prettyRsp,
          });
          needWrite = true;
        }
      });
    }
    await queue.onIdle();
    if (needWrite) {
      await Bun.write(patchAllJsonPath, JSON.stringify(patchAllJson, null, 2));
    }
  }
}

async function fetchAndSaveLatestGameResources(cfg: any, channelStr: string) {
  logger.debug('Fetching latestGameRes ...');

  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;

  const gameAllJsonPath = path.join(
    argvUtils.getArgv()['outputDir'],
    'akEndfield',
    'launcher',
    'game',
    channelStr,
    'all.json',
  );

  if (!(await Bun.file(gameAllJsonPath).exists())) {
    logger.warn('Skipping latestGameRes: game/all.json not found');
    return;
  }

  const versionInfoList = ((await Bun.file(gameAllJsonPath).json()) as StoredData<LatestGameResponse>[])
    .map((e) => e.rsp)
    .map((e) => ({
      version: e.version,
      versionMinor: semver.major(e.version) + '.' + semver.minor(e.version),
      randStr: /_([^/]+)\/.+?$/.exec(e.pkg.file_path)![1],
    }))
    .sort((a, b) => semver.compare(b.version, a.version));

  for (const platform of platforms) {
    let isLatestWrote: boolean = false;
    for (const versionInfoEntry of versionInfoList) {
      if (!versionInfoEntry.randStr) throw new Error('version rand_str not found');
      const rsp = await apiUtils.akEndfield.launcher.latestGameResources(
        cfg.appCode.game.osWinRel,
        versionInfoEntry.versionMinor,
        versionInfoEntry.version,
        versionInfoEntry.randStr,
        platform,
      );
      logger.info(`Fetched latestGameRes: ${platform}, v${versionInfoEntry.version}, ${rsp.res_version}`);
      const prettyRsp = {
        req: {
          appCode: cfg.appCode.game.osWinRel,
          gameVersion: versionInfoEntry.versionMinor,
          version: versionInfoEntry.version,
          randStr: versionInfoEntry.randStr,
          platform,
        },
        rsp,
      };

      await saveResult(
        ['akEndfield', 'launcher', 'game_resources', channelStr, platform],
        versionInfoEntry.version,
        prettyRsp,
        !isLatestWrote,
      );
      isLatestWrote = true;
    }
  }
}

async function fetchAndSaveLatestLauncher(cfg: any, channelStr: string) {
  logger.debug('Fetching latestLauncher ...');
  const launcherTargetAppList = ['EndField', 'official'] as const;
  for (const launcherTargetAppEntry of launcherTargetAppList) {
    const rsp = await apiUtils.akEndfield.launcher.latestLauncher(
      cfg.appCode.launcher.osWinRel,
      cfg.channel.osWinRel,
      cfg.channel.osWinRel,
      null,
      launcherTargetAppEntry === 'official' ? null : launcherTargetAppEntry,
    );
    logger.info(`Fetched latestLauncher: v${rsp.version}, ${launcherTargetAppEntry}`);
    const prettyRsp = {
      req: {
        appCode: cfg.appCode.launcher.osWinRel,
        channel: cfg.channel.osWinRel,
        subChannel: cfg.channel.osWinRel,
        targetApp: launcherTargetAppEntry === 'official' ? null : launcherTargetAppEntry,
      },
      rsp,
    };

    await saveResult(
      ['akEndfield', 'launcher', 'launcher', launcherTargetAppEntry, channelStr],
      rsp.version,
      prettyRsp,
    );
  }
}

async function mainCmdHandler() {
  const cfg = appConfig.network.api.akEndfield;
  const channelStr = String(cfg.channel.osWinRel);

  const gameTargets: GameTarget[] = [
    {
      name: 'Official',
      launcherAppCode: cfg.appCode.launcher.osWinRel,
      subChannel: cfg.channel.osWinRel,
      launcherSubChannel: cfg.channel.osWinRel,
      dirName: String(cfg.channel.osWinRel),
    },
    {
      name: 'Epic',
      launcherAppCode: cfg.appCode.launcher.osWinRelEpic,
      subChannel: cfg.subChannel.osWinRelEpic,
      launcherSubChannel: cfg.subChannel.osWinRelEpic,
      dirName: String(cfg.subChannel.osWinRelEpic),
    },
    {
      name: 'GooglePlay',
      launcherAppCode: cfg.appCode.launcher.osWinRelEpic,
      subChannel: cfg.subChannel.osWinRelGooglePlay,
      launcherSubChannel: cfg.subChannel.osWinRelGooglePlay,
      dirName: String(cfg.subChannel.osWinRelGooglePlay),
    },
  ];

  await fetchAndSaveLatestGames(cfg, gameTargets);
  await fetchAndSaveLatestGamePatches(cfg, gameTargets);
  await fetchAndSaveLatestGameResources(cfg, channelStr);
  await fetchAndSaveLatestLauncher(cfg, channelStr);

  await (async () => {
    //* Markdown generate
    for (const target of gameTargets) {
      await generateGameListMd(target);
      await generatePatchListMd(target);
    }
    await generateResourceListMd(channelStr);
  })();
}

export default mainCmdHandler;
