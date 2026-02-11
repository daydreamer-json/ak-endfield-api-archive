import path from 'node:path';
import { DateTime } from 'luxon';
import PQueue from 'p-queue';
import semver from 'semver';
import apiUtils from '../utils/api/index.js';
import argvUtils from '../utils/argv.js';
import appConfig from '../utils/config.js';
import logger from '../utils/logger.js';
import mathUtils from '../utils/math.js';
import webArchiveOrg from '../utils/webArchiveOrg.js';

let waybackCred: { user: string; sig: string } | null = null;

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
// type LatestLauncherExeResponse = Awaited<ReturnType<typeof apiUtils.akEndfield.launcher.latestLauncherExe>>;

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

function getObjectDiff(
  obj1: any,
  obj2: any,
  ignoreRules: {
    path: string[];
    pattern: RegExp;
  }[] = [],
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
      (r) => r.path.length === fullPath.length && r.path.every((p, i) => p === fullPath[i]),
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

async function saveResult<T>(
  subPaths: string[],
  version: string,
  data: { req: any; rsp: T },
  saveLatest: boolean = true,
  ignoreRules: Parameters<typeof getObjectDiff>[2] = [],
) {
  const outputDir = argvUtils.getArgv()['outputDir'];
  const filePathBase = path.join(outputDir, ...subPaths);

  const filesToCheck = [path.join(filePathBase, `v${version}.json`)];
  if (saveLatest) {
    filesToCheck.push(path.join(filePathBase, 'latest.json'));
  }

  const dataStr = JSON.stringify(data, null, 2);

  for (const filePath of filesToCheck) {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
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

  const allFilePath = path.join(filePathBase, 'all.json');
  const allFile = Bun.file(allFilePath);
  let allData: StoredData<T>[] = [];
  if (await allFile.exists()) {
    allData = await allFile.json();
  }

  const exists = allData.some((e) => {
    const diff = getObjectDiff({ req: e.req, rsp: e.rsp }, data, ignoreRules);
    return Object.keys(diff).length === 0;
  });

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
      mdTexts.push(
        '|' + [`[${fileName}](${f.url})`, `\`${f.md5}\``, formatBytes(parseInt(f.package_size))].join('|') + '|',
      );
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
        '|' +
          [
            `[${fileName}](${e.rsp.patch.url})`,
            `\`${e.rsp.patch.md5}\``,
            formatBytes(parseInt(e.rsp.patch.package_size)),
          ].join('|') +
          '|',
      );
    }

    for (const f of e.rsp.patch.patches) {
      const fileName = new URL(f.url).pathname.split('/').pop() ?? '';
      mdTexts.push(
        '|' + [`[${fileName}](${f.url})`, `\`${f.md5}\``, formatBytes(parseInt(f.package_size))].join('|') + '|',
      );
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
      '|Date|Initial|Main|Kick|Game version|',
      '|--|--|--|--|',
      ...resVersionSet.map(
        (resVerObj) =>
          '|' +
          [
            DateTime.fromISO(resVerObj.rsp.updatedAt, { setZone: true })
              .setZone('UTC+8')
              .toFormat('yyyy/MM/dd HH:mm:ss'),
            `[${resVerObj.rsp.rsp.resources.find((e) => e.name === 'initial')!.version}](${resVerObj.rsp.rsp.resources.find((e) => e.name === 'initial')!.path})`,
            `[${resVerObj.rsp.rsp.resources.find((e) => e.name === 'main')!.version}](${resVerObj.rsp.rsp.resources.find((e) => e.name === 'main')!.path})`,
            JSON.parse(resVerObj.rsp.rsp.configs).kick_flag === true ? '✅' : '',
            resVerObj.versions.sort((a, b) => semver.compare(b, a)).join(', '),
          ].join('|') +
          '|',
      ),
      '',
    );
  }

  await Bun.write(
    path.join(outputDir, 'akEndfield', 'launcher', 'game_resources', channelStr, 'list.md'),
    mdTexts.join('\n'),
  );
}

async function generateLauncherMd(type: 'zip' | 'exe') {
  const cfg = appConfig.network.api.akEndfield;
  const outputDir = argvUtils.getArgv()['outputDir'];
  const settings = {
    zip: {
      subdir: 'launcher',
      title: 'Launcher Packages (zip)',
      headers: ['Date', 'Version', 'File', 'MD5 Checksum', 'Unpacked', 'Packed'],
      align: ['---', '---', '---', '---', '--:', '--:'],
    },
    exe: {
      subdir: 'launcherExe',
      title: 'Launcher Packages (Installer)',
      headers: ['Date', 'Version', 'File', 'Size'],
      align: ['---', '---', '---', '--:'],
    },
  }[type];

  const regions = [
    { id: 'os' as const, apps: ['EndField', 'Official'] as const, channel: cfg.channel.osWinRel },
    { id: 'cn' as const, apps: ['EndField', 'Arknights', 'Official'] as const, channel: cfg.channel.cnWinRel },
  ];

  const mdTexts: string[] = [
    `# ${settings.title}\n`,
    ...regions.flatMap((r) =>
      r.apps.map((app) => `- [${r.id.toUpperCase()} ${app}](#launcher-${r.id}-${app.toLowerCase()})`),
    ),
    '\n',
  ];

  const waybackDb = await (async () => {
    const localJsonPath = path.join(outputDir, 'wayback_machine.json');
    return (await Bun.file(localJsonPath).json()) as string[];
  })();

  for (const region of regions) {
    for (const appName of region.apps) {
      const jsonPath = path.join(
        outputDir,
        'akEndfield',
        'launcher',
        settings.subdir,
        appName,
        String(region.channel),
        'all.json',
      );
      const jsonData = (await Bun.file(jsonPath).json()) as StoredData<any>[];

      mdTexts.push(
        `<h2 id="launcher-${region.id}-${appName.toLowerCase()}">${region.id.toUpperCase()} ${appName}</h2>\n`,
        `|${settings.headers.join('|')}|`,
        `|${settings.align.join('|')}|`,
      );

      for (const e of jsonData) {
        const url = type === 'zip' ? e.rsp.zip_package_url : e.rsp.exe_url;
        const fileName = new URL(url).pathname.split('/').pop() ?? '';
        const cleanUrl = new URL(url);
        cleanUrl.search = '';
        const waybackUrl = waybackDb.find((f) => f.includes(cleanUrl.toString()));
        const fileLink = waybackUrl ? `${fileName} [Orig](${url}) / [Mirror](${waybackUrl})` : `[${fileName}](${url})`;
        const date = DateTime.fromISO(e.updatedAt, { setZone: true }).setZone('UTC+8').toFormat('yyyy/MM/dd HH:mm:ss');
        const row =
          type === 'zip'
            ? [
                date,
                e.rsp.version,
                fileLink,
                `\`${e.rsp.md5}\``,
                formatBytes(parseInt(e.rsp.total_size) - parseInt(e.rsp.package_size)),
                formatBytes(parseInt(e.rsp.package_size)),
              ]
            : [date, e.rsp.version, fileLink, formatBytes(parseInt(e.rsp.exe_size))];

        mdTexts.push(`|${row.join('|')}|`);
      }
      mdTexts.push('');
    }
  }
  await Bun.write(path.join(outputDir, 'akEndfield', 'launcher', settings.subdir, 'list.md'), mdTexts.join('\n'));
}

// 実行例
// await generateLauncherMd('zip');
// await generateLauncherMd('exe');

async function fetchAndSaveLatestGames(cfg: typeof appConfig.network.api.akEndfield, gameTargets: GameTarget[]) {
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

async function fetchAndSaveLatestGamePatches(cfg: typeof appConfig.network.api.akEndfield, gameTargets: GameTarget[]) {
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

async function fetchAndSaveLatestGameResources(cfg: typeof appConfig.network.api.akEndfield, channelStr: string) {
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

async function fetchAndSaveLatestLauncher(cfg: typeof appConfig.network.api.akEndfield) {
  logger.debug('Fetching latestLauncher ...');
  const regions = [
    {
      id: 'os' as const,
      apps: ['EndField', 'Official'] as const,
      code: cfg.appCode.launcher.osWinRel,
      channel: cfg.channel.osWinRel,
    },
    {
      id: 'cn' as const,
      apps: ['EndField', 'Arknights', 'Official'] as const,
      code: cfg.appCode.launcher.cnWinRel,
      channel: cfg.channel.cnWinRel,
    },
  ];
  const removeQueryStr = (url: string): string => {
    const urlObj = new URL(url);
    urlObj.search = '';
    return urlObj.toString();
  };
  const saveToWM = async (url: string): Promise<void> => {
    if (waybackCred === null) throw new Error('Wayback Machine auth is null');
    const localJsonPath = path.join(argvUtils.getArgv()['outputDir'], 'wayback_machine.json');
    const localJson: string[] = await Bun.file(localJsonPath).json();
    if (!localJson.find((e) => e.includes(removeQueryStr(url)))) {
      await webArchiveOrg.savePage(url, waybackCred);
    }
  };

  for (const { id, apps, code, channel } of regions) {
    for (const app of apps) {
      const apiArgs = [code, channel, channel, null] as const;
      const rsp = await apiUtils.akEndfield.launcher.latestLauncher(...apiArgs, app, id);
      const prettyRsp = { req: { appCode: code, channel, subChannel: channel, targetApp: app }, rsp };
      const appLower = app.toLowerCase();
      const rspExe = await apiUtils.akEndfield.launcher.latestLauncherExe(...apiArgs, appLower, id);
      const prettyRspExe = { req: { appCode: code, channel, subChannel: channel, ta: appLower }, rsp: rspExe };
      logger.info(`Fetched latestLauncher: v${rsp.version}, ${id}, ${app}`);
      const basePath = ['akEndfield', 'launcher'];
      const channelStr = String(channel);
      const ignoreRules = [
        { path: ['rsp', 'zip_package_url'], pattern: /\?auth_key=.*$/ },
        { path: ['rsp', 'exe_url'], pattern: /\?auth_key=.*$/ },
      ];
      if (rsp.zip_package_url.includes('?auth_key')) await saveToWM(rsp.zip_package_url);
      if (rspExe.exe_url.includes('?auth_key')) await saveToWM(rspExe.exe_url);
      await saveResult([...basePath, 'launcher', app, channelStr], rsp.version, prettyRsp, true, ignoreRules);
      await saveResult([...basePath, 'launcherExe', app, channelStr], rspExe.version, prettyRspExe, true, ignoreRules);
    }
  }
}

async function mainCmdHandler() {
  waybackCred = await (async () => {
    logger.debug('Fetching credentials for Wayback Machine ...');
    const authTextData = await Bun.file('config/config_auth.txt').json();
    const result = await webArchiveOrg.login(authTextData[0], authTextData[1]);
    logger.info('Logged in to Wayback Machine');
    return result;
  })();

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
      name: 'Google Play',
      launcherAppCode: cfg.appCode.launcher.osWinRelEpic,
      subChannel: cfg.subChannel.osWinRelGooglePlay,
      launcherSubChannel: cfg.subChannel.osWinRelGooglePlay,
      dirName: String(cfg.subChannel.osWinRelGooglePlay),
    },
  ];

  await fetchAndSaveLatestGames(cfg, gameTargets);
  await fetchAndSaveLatestGamePatches(cfg, gameTargets);
  await fetchAndSaveLatestGameResources(cfg, channelStr);
  await fetchAndSaveLatestLauncher(cfg);

  for (const target of gameTargets) {
    await generateGameListMd(target);
    await generatePatchListMd(target);
  }
  await generateResourceListMd(channelStr);
  await generateLauncherMd('zip');
  await generateLauncherMd('exe');
}

export default mainCmdHandler;
