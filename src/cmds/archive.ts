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

let githubAuthCfg: { token: string; owner: string; repo: string; tag: string } | null = null;
let octoClient: Octokit | null = null;
let saveToGHMirrorNeedUrls: { url: string; name: string | null }[] = [];

const formatBytes = (size: number) =>
  mathUtils.formatFileSize(size, {
    decimals: 2,
    decimalPadding: true,
    unitVisible: true,
    useBinaryUnit: true,
    useBitUnit: false,
    unit: null,
  });

const diffIgnoreRules = [
  ['rsp', 'pkg', 'url'],
  ['rsp', 'pkg', 'packs', '*', 'url'],
  ['rsp', 'patch', 'url'],
  ['rsp', 'patch', 'patches', '*', 'url'],
  ['rsp', 'zip_package_url'],
  ['rsp', 'exe_url'],
].map((path) => ({ path, pattern: /[?&]auth_key=[^&]+/g }));

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

async function saveToGHMirror(url: string, name: string | null): Promise<void> {
  const mirrorFileDb = await (async () => {
    const localJsonPath = path.join(argvUtils.getArgv()['outputDir'], 'mirror_file_list.json');
    return (await Bun.file(localJsonPath).json()) as MirrorFileEntry[];
  })();
  if (!mirrorFileDb.find((e) => e.orig.includes(stringUtils.removeQueryStr(url)))) {
    await githubUtils.uploadAsset(octoClient, githubAuthCfg, url, name);
    if (githubAuthCfg) {
      mirrorFileDb.push({
        orig: stringUtils.removeQueryStr(url),
        mirror: `https://github.com/${githubAuthCfg.owner}/${githubAuthCfg.repo}/releases/download/${githubAuthCfg.tag}/${name ?? new URL(url).pathname.split('/').pop() ?? ''}`,
      });
    }
  }
}

async function generateGameListMd(target: GameTarget) {
  const outputDir = argvUtils.getArgv()['outputDir'];
  const gameAllJsonPath = path.join(outputDir, 'akEndfield', 'launcher', 'game', target.dirName, 'all.json');

  if (!(await Bun.file(gameAllJsonPath).exists())) return;

  const gameAllJson = (await Bun.file(gameAllJsonPath).json()) as StoredData<LatestGameResponse>[];
  const mdTexts: string[] = [];

  const mirrorFileDb = await (async () => {
    const localJsonPath = path.join(outputDir, 'mirror_file_list.json');
    return (await Bun.file(localJsonPath).json()) as MirrorFileEntry[];
  })();

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
      const cleanUrl = new URL(f.url);
      cleanUrl.search = '';
      const mirrorUrlEntry = mirrorFileDb.find((g) => g.orig.includes(cleanUrl.toString()));
      const fileLink = mirrorUrlEntry
        ? `${fileName} [Orig](${f.url}) / [Mirror](${mirrorUrlEntry.mirror})`
        : `[${fileName}](${f.url})`;
      mdTexts.push('|' + [fileLink, `\`${f.md5}\``, formatBytes(parseInt(f.package_size))].join('|') + '|');
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

  const mirrorFileDb = await (async () => {
    const localJsonPath = path.join(outputDir, 'mirror_file_list.json');
    return (await Bun.file(localJsonPath).json()) as MirrorFileEntry[];
  })();

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
      const cleanUrl = new URL(e.rsp.patch.url);
      cleanUrl.search = '';
      const mirrorUrlEntry = mirrorFileDb.find((f) => f.orig.includes(cleanUrl.toString()));
      const fileLink = mirrorUrlEntry
        ? `${fileName} [Orig](${e.rsp.patch.url}) / [Mirror](${mirrorUrlEntry.mirror})`
        : `[${fileName}](${e.rsp.patch.url})`;
      mdTexts.push(
        '|' + [fileLink, `\`${e.rsp.patch.md5}\``, formatBytes(parseInt(e.rsp.patch.package_size))].join('|') + '|',
      );
    }

    for (const f of e.rsp.patch.patches) {
      const fileName = new URL(f.url).pathname.split('/').pop() ?? '';
      const cleanUrl = new URL(f.url);
      cleanUrl.search = '';
      const mirrorUrlEntry = mirrorFileDb.find((g) => g.orig.includes(cleanUrl.toString()));
      const fileLink = mirrorUrlEntry
        ? `${fileName} [Orig](${f.url}) / [Mirror](${mirrorUrlEntry.mirror})`
        : `[${fileName}](${f.url})`;
      mdTexts.push('|' + [fileLink, `\`${f.md5}\``, formatBytes(parseInt(f.package_size))].join('|') + '|');
    }
    mdTexts.push('');
  }

  await Bun.write(
    path.join(outputDir, 'akEndfield', 'launcher', 'game', target.dirName, 'list_patch.md'),
    mdTexts.join('\n'),
  );
}

async function generateResourceListMd(gameTargets: GameTarget[]) {
  const sanitizedGameTargets = [
    ...new Set(gameTargets.map((e) => JSON.stringify({ region: e.region, appCode: e.appCode, channel: e.channel }))),
  ].map((e) => JSON.parse(e)) as { region: 'os' | 'cn'; appCode: string; channel: number }[];

  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;
  const outputDir = argvUtils.getArgv()['outputDir'];

  for (const target of sanitizedGameTargets) {
    const mdTexts: string[] = [];
    mdTexts.push('# Game Resources\n', ...platforms.map((e) => `- [${e}](#res-${e})`), '');

    const baseFolderPath = path.join(outputDir, 'akEndfield', 'launcher', 'game_resources', String(target.channel));
    for (const platform of platforms) {
      const resourceAllJsonPath = path.join(baseFolderPath, platform, 'all.json');

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
    await Bun.write(path.join(baseFolderPath, 'list.md'), mdTexts.join('\n'));
  }
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

  const mirrorFileDb = await (async () => {
    const localJsonPath = path.join(outputDir, 'mirror_file_list.json');
    return (await Bun.file(localJsonPath).json()) as MirrorFileEntry[];
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
        const mirrorUrlEntry = mirrorFileDb.find((f) => f.orig.includes(cleanUrl.toString()));
        const fileLink = mirrorUrlEntry
          ? `${fileName} [Orig](${url}) / [Mirror](${mirrorUrlEntry.mirror})`
          : `[${fileName}](${url})`;
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

async function fetchAndSaveLatestGames(gameTargets: GameTarget[]) {
  logger.debug(`Fetching latestGame ...`);
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

    (() => {
      const hashPair: { url: string; md5: string }[] = [];
      if (rsp.pkg.url) hashPair.push({ url: rsp.pkg.url, md5: rsp.pkg.md5 });
      rsp.pkg.packs.forEach((e) => hashPair.push({ url: e.url, md5: e.md5 }));
      const unique = [...new Map(hashPair.map((item) => [item.md5, item])).values()];
      const subChns = appConfig.network.api.akEndfield.subChannel;
      unique.forEach((e) => {
        if ([subChns.cnWinRel, subChns.osWinRel].includes(target.subChannel)) {
          saveToGHMirrorNeedUrls.push({ url: e.url, name: null });
        }
      });
    })();

    await saveResult(['akEndfield', 'launcher', 'game', target.dirName], rsp.version, prettyRsp, true, diffIgnoreRules);
  }
}

async function fetchAndSaveLatestGamePatches(gameTargets: GameTarget[]) {
  logger.debug(`Fetching latestGamePatch ...`);
  for (const target of gameTargets) {
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
          target.appCode,
          target.launcherAppCode,
          target.channel,
          target.subChannel,
          target.launcherSubChannel,
          ver,
          target.region,
        );
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
        if (rsp.patch === null) return;
        const exists = patchAllJson.some((e) => {
          const diff = getObjectDiff({ req: e.req, rsp: e.rsp }, prettyRsp, diffIgnoreRules);
          return Object.keys(diff).length === 0;
        });
        if (!exists) {
          logger.debug(
            `Fetched latestGamePatch: ${target.region.toUpperCase()}, ${target.name}, v${rsp.request_version} -> v${rsp.version}, ${formatBytes(
              parseInt(rsp.patch.total_size) - parseInt(rsp.patch.package_size),
            )}`,
          );
          patchAllJson.push({
            updatedAt: DateTime.now().toISO(),
            ...prettyRsp,
          });
          needWrite = true;
          (() => {
            const hashPair: { url: string; md5: string }[] = [];
            hashPair.push({ url: rsp.patch.url, md5: rsp.patch.md5 });
            rsp.patch.patches.forEach((e) => hashPair.push({ url: e.url, md5: e.md5 }));
            const unique = [...new Map(hashPair.map((item) => [item.md5, item])).values()];
            const subChns = appConfig.network.api.akEndfield.subChannel;
            unique.forEach((e) => {
              if ([subChns.cnWinRel, subChns.osWinRel].includes(target.subChannel)) {
                const urlObj = new URL(e.url);
                urlObj.search = '';
                saveToGHMirrorNeedUrls.push({
                  url: e.url,
                  name: urlObj.pathname.split('/').filter(Boolean).slice(-3).join('_'),
                });
              }
            });
          })();
        }
      });
    }
    await queue.onIdle();
    if (needWrite) {
      await Bun.write(patchAllJsonPath, JSON.stringify(patchAllJson, null, 2));
    }
  }
}

async function fetchAndSaveLatestGameResources(gameTargets: GameTarget[]) {
  logger.debug('Fetching latestGameRes ...');
  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;

  const sanitizedGameTargets = [
    ...new Set(gameTargets.map((e) => JSON.stringify({ region: e.region, appCode: e.appCode, channel: e.channel }))),
  ].map((e) => JSON.parse(e)) as { region: 'os' | 'cn'; appCode: string; channel: number }[];

  const needDlRawFileBase: string[] = [];

  for (const target of sanitizedGameTargets) {
    const gameAllJsonPath = path.join(
      argvUtils.getArgv()['outputDir'],
      'akEndfield',
      'launcher',
      'game',
      String(target.channel),
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
        if (!versionInfoEntry.randStr) throw new Error('version rand_str not found. regexp is broken');
        const rsp = await apiUtils.akEndfield.launcher.latestGameResources(
          target.appCode,
          versionInfoEntry.versionMinor,
          versionInfoEntry.version,
          versionInfoEntry.randStr,
          platform,
          target.region,
        );
        logger.info(
          `Fetched latestGameRes: ${target.region.toUpperCase()}, ${platform}, v${versionInfoEntry.version}, ${rsp.res_version}`,
        );
        const prettyRsp = {
          req: {
            appCode: target.appCode,
            gameVersion: versionInfoEntry.versionMinor,
            version: versionInfoEntry.version,
            randStr: versionInfoEntry.randStr,
            platform,
          },
          rsp,
        };

        await saveResult(
          ['akEndfield', 'launcher', 'game_resources', String(target.channel), platform],
          versionInfoEntry.version,
          prettyRsp,
          !isLatestWrote,
        );
        isLatestWrote = true;

        needDlRawFileBase.push(...rsp.resources.map((e) => e.path));
      }
    }
  }
}

async function fetchAndSaveAllGameResRawData(gameTargets: GameTarget[]) {
  logger.debug('Fetching raw game resources ...');

  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;
  const sanitizedGameTargets = [
    ...new Set(gameTargets.map((e) => JSON.stringify({ region: e.region, appCode: e.appCode, channel: e.channel }))),
  ].map((e) => JSON.parse(e)) as { region: 'os' | 'cn'; appCode: string; channel: number }[];
  const queue = new PQueue({ concurrency: appConfig.threadCount.network });
  const needDlRawFileBase: string[] = [];
  const fileNameList = ['index_initial.json', 'index_main.json', 'pref_initial.json', 'pref_main.json', 'patch.json'];

  for (const target of sanitizedGameTargets) {
    for (const platform of platforms) {
      const resAllJsonPath = path.join(
        argvUtils.getArgv()['outputDir'],
        'akEndfield',
        'launcher',
        'game_resources',
        String(target.channel),
        platform,
        'all.json',
      );
      const resAllJson = (await Bun.file(resAllJsonPath).json()) as StoredData<LatestGameResourcesResponse>[];
      for (const resEntry of resAllJson) {
        needDlRawFileBase.push(...resEntry.rsp.resources.map((e) => e.path));
      }
    }
  }
  const wroteFiles: string[] = [];
  for (const rawFileBaseEntry of [...new Set(needDlRawFileBase)]) {
    for (const fileNameEntry of fileNameList) {
      const urlObj = new URL(rawFileBaseEntry + '/' + fileNameEntry);
      urlObj.search = '';
      const localFilePath = path.join(
        argvUtils.getArgv()['outputDir'],
        'raw',
        urlObj.hostname,
        ...urlObj.pathname.split('/').filter(Boolean),
      );
      queue.add(async () => {
        if (!(await Bun.file(localFilePath).exists())) {
          try {
            const rsp = await ky
              .get(urlObj.href, { headers: { 'User-Agent': appConfig.network.userAgent.minimum } })
              .bytes();
            await Bun.write(localFilePath, rsp);
            wroteFiles.push(localFilePath);
            // logger.trace('Downloaded: ' + urlObj.href);
          } catch (err) {
            if (!(err instanceof HTTPError && (err.response.status === 404 || err.response.status === 403))) {
              throw err;
            }
          }
        }
      });
    }
  }
  await queue.onIdle();
  logger.info(`Fetched raw game resources: ${wroteFiles.length} files`);
}

async function fetchAndSaveLatestLauncher(launcherTargets: LauncherTarget[]) {
  logger.debug('Fetching latestLauncher ...');
  for (const { id, apps, code, channel } of launcherTargets) {
    for (const app of apps) {
      const apiArgs = [code, channel, channel, null] as const;
      const rsp = await apiUtils.akEndfield.launcher.latestLauncher(...apiArgs, app, id);
      const prettyRsp = { req: { appCode: code, channel, subChannel: channel, targetApp: app }, rsp };
      const appLower = app.toLowerCase();
      const rspExe = await apiUtils.akEndfield.launcher.latestLauncherExe(...apiArgs, appLower, id);
      const prettyRspExe = { req: { appCode: code, channel, subChannel: channel, ta: appLower }, rsp: rspExe };
      logger.info(`Fetched latestLauncher: ${id.toUpperCase()}, v${rsp.version}, ${app}`);
      const basePath = ['akEndfield', 'launcher'];
      const channelStr = String(channel);
      saveToGHMirrorNeedUrls.push({ url: rsp.zip_package_url, name: null });
      saveToGHMirrorNeedUrls.push({ url: rspExe.exe_url, name: null });
      await saveResult([...basePath, 'launcher', app, channelStr], rsp.version, prettyRsp, true, diffIgnoreRules);
      await saveResult(
        [...basePath, 'launcherExe', app, channelStr],
        rspExe.version,
        prettyRspExe,
        true,
        diffIgnoreRules,
      );
    }
  }
}

async function mainCmdHandler() {
  githubAuthCfg = await (async () => {
    if (await Bun.file('config/config_auth.yaml').exists()) {
      return YAML.parse(await Bun.file('config/config_auth.yaml').text()).github;
    } else {
      return null;
    }
  })();
  if (githubAuthCfg) {
    logger.info('Logging in to GitHub using a PAT');
    octoClient = new Octokit({ auth: githubAuthCfg.token });
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
      launcherAppCode: cfg.appCode.launcher.osWinRelEpic, // why epic
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
  ];

  const launcherTargets: LauncherTarget[] = [
    {
      id: 'os',
      apps: ['EndField', 'Official'],
      code: cfg.appCode.launcher.osWinRel,
      channel: cfg.channel.osWinRel,
    },
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

  // todo: Implement multithreading or separate the steps in GH Actions
  for (const e of saveToGHMirrorNeedUrls) {
    await saveToGHMirror(e.url, e.name);
  }
  const ghRelInfo = await githubUtils.getReleaseInfo(octoClient, githubAuthCfg);
  if (ghRelInfo) {
    logger.info(
      'GitHub Releases size total: ' + formatBytes(mathUtils.arrayTotal(ghRelInfo.assets.map((e) => e.size))),
    );
  }

  for (const target of gameTargets) {
    await generateGameListMd(target);
    await generatePatchListMd(target);
  }
  await generateResourceListMd(gameTargets);
  await generateLauncherMd('zip');
  await generateLauncherMd('exe');
}

export default mainCmdHandler;
