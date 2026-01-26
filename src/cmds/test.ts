import path from 'node:path';
import { DateTime } from 'luxon';
import PQueue from 'p-queue';
import semver from 'semver';
import apiUtils from '../utils/api.js';
import argvUtils from '../utils/argv.js';
import appConfig from '../utils/config.js';
import logger from '../utils/logger.js';
import mathUtils from '../utils/math.js';

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

async function saveResult(
  subPaths: string[],
  version: string,
  data: { req: any; rsp: any },
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
  let allData: any[] = [];
  if (await allFile.exists()) {
    allData = await allFile.json();
  }

  const exists = allData.some((e: any) => JSON.stringify({ req: e.req, rsp: e.rsp }) === dataMinified);

  if (!exists) {
    allData.push({ updatedAt: DateTime.now().toISO(), ...data });
    await Bun.write(allFilePath, JSON.stringify(allData, null, 2));
  }
}

async function mainCmdHandler() {
  const cfg = appConfig.network.api.akEndfield;
  const channelStr = String(cfg.channel.osWinRel);

  await (async () => {
    logger.debug('Fetching latestGame ...');
    const rsp = await apiUtils.apiAkEndfield.launcher.latestGame(
      cfg.appCode.game.osWinRel,
      cfg.appCode.launcher.osWinRel,
      cfg.channel.osWinRel,
      cfg.channel.osWinRel,
      cfg.channel.osWinRel,
      null,
    );
    logger.info(
      `Fetched latestGame: v${rsp.version}, ${mathUtils.formatFileSize(
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
        launcherAppCode: cfg.appCode.launcher.osWinRel,
        channel: cfg.channel.osWinRel,
        subChannel: cfg.channel.osWinRel,
        launcherSubChannel: cfg.channel.osWinRel,
      },
      rsp,
    };

    await saveResult(['akEndfield', 'launcher', 'game', channelStr], rsp.version, prettyRsp);
  })();

  await (async () => {
    logger.debug('Fetching latestGame (patch) ...');
    const gameAllJson = await Bun.file(
      path.join(argvUtils.getArgv()['outputDir'], 'akEndfield', 'launcher', 'game', channelStr, 'all.json'),
    ).json();
    const patchAllJson = await Bun.file(
      path.join(argvUtils.getArgv()['outputDir'], 'akEndfield', 'launcher', 'game', channelStr, 'all_patch.json'),
    ).json();
    const versionList = ([...new Set(gameAllJson.map((e: any) => e.rsp.version))] as string[])
      .sort((a, b) => semver.compare(b, a))
      .slice(1);
    let needWrite: boolean = false;
    const queue = new PQueue({ concurrency: appConfig.threadCount.network });
    for (const ver of versionList) {
      queue.add(async () => {
        const rsp = await apiUtils.apiAkEndfield.launcher.latestGame(
          cfg.appCode.game.osWinRel,
          cfg.appCode.launcher.osWinRel,
          cfg.channel.osWinRel,
          cfg.channel.osWinRel,
          cfg.channel.osWinRel,
          ver,
        );
        const prettyRsp = {
          req: {
            appCode: cfg.appCode.game.osWinRel,
            launcherAppCode: cfg.appCode.launcher.osWinRel,
            channel: cfg.channel.osWinRel,
            subChannel: cfg.channel.osWinRel,
            launcherSubChannel: cfg.channel.osWinRel,
            version: ver,
          },
          rsp,
        };
        if (rsp.patch === null) return;
        if (
          patchAllJson
            .map((e: any) => JSON.stringify({ req: e.req, rsp: e.rsp }))
            .includes(JSON.stringify(prettyRsp)) === false
        ) {
          logger.debug(
            `Fetched latestGame (patch): v${rsp.request_version} -> v${rsp.version}, ${mathUtils.formatFileSize(
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
      await Bun.write(
        path.join(argvUtils.getArgv()['outputDir'], 'akEndfield', 'launcher', 'game', channelStr, 'all_patch.json'),
        JSON.stringify(patchAllJson, null, 2),
      );
    }
  })();

  await (async () => {
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

    const versionInfoList = (
      (await Bun.file(gameAllJsonPath).json()).map((e: any) => e.rsp) as Awaited<
        ReturnType<typeof apiUtils.apiAkEndfield.launcher.latestGame>
      >[]
    )
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
        const rsp = await apiUtils.apiAkEndfield.launcher.latestGameResources(
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
  })();

  await (async () => {
    logger.debug('Fetching latestLauncher ...');
    const launcherTargetAppList = ['EndField', 'official'] as const;
    for (const launcherTargetAppEntry of launcherTargetAppList) {
      const rsp = await apiUtils.apiAkEndfield.launcher.latestLauncher(
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
  })();

  await (async () => {
    //* Markdown generate
    await (async () => {
      const gameAllJson = await Bun.file(
        path.join(argvUtils.getArgv()['outputDir'], 'akEndfield', 'launcher', 'game', channelStr, 'all.json'),
      ).json();
      const mdTexts: string[] = [];
      mdTexts.push(
        ...[
          '# Game Packages\n',
          ...gameAllJson.map(
            (e: any) =>
              `- [${e.rsp.version} (${DateTime.fromISO(e.updatedAt, { setZone: true }).setZone('UTC+8').toFormat('yyyy/MM/dd HH:mm:ss')})](#ver-${e.rsp.version}-${Math.ceil(DateTime.fromISO(e.updatedAt).toSeconds())})`,
          ),
          '',
        ],
        ...gameAllJson.map((e: any) =>
          [
            `<h2 id="ver-${e.rsp.version}-${Math.ceil(DateTime.fromISO(e.updatedAt).toSeconds())}">${e.rsp.version} (${DateTime.fromISO(e.updatedAt, { setZone: true }).setZone('UTC+8').toFormat('yyyy/MM/dd HH:mm:ss')})</h2>\n`,
            `<table>`,
            `  <tr><td>Unpacked Size</td><td style="text-align: right;"><b>${mathUtils.formatFileSize(
              e.rsp.pkg.total_size - mathUtils.arrayTotal(e.rsp.pkg.packs.map((f: any) => parseInt(f.package_size))),
              {
                decimals: 2,
                decimalPadding: true,
                unitVisible: true,
                useBinaryUnit: true,
                useBitUnit: false,
                unit: null,
              },
            )}</b></td></tr>`,
            `  <tr><td>Packed Size</td><td style="text-align: right;"><b>${mathUtils.formatFileSize(mathUtils.arrayTotal(e.rsp.pkg.packs.map((f: any) => parseInt(f.package_size))), { decimals: 2, decimalPadding: true, unitVisible: true, useBinaryUnit: true, useBitUnit: false, unit: null })}</b></td></tr>`,
            `</table>\n`,
            `|File|MD5 Checksum|Size|`,
            `|:--|:--|--:|`,
            ...e.rsp.pkg.packs.map((f: any) => [
              `|[${new URL(f.url).pathname.split('/').pop() ?? ''}](${f.url})|\`${f.md5}\`|${mathUtils.formatFileSize(parseInt(f.package_size), { decimals: 2, decimalPadding: true, unitVisible: true, useBinaryUnit: true, useBitUnit: false, unit: null })}|`,
            ]),
            '',
          ].join('\n'),
        ),
      );
      await Bun.write(
        path.join(argvUtils.getArgv()['outputDir'], 'akEndfield', 'launcher', 'game', channelStr, 'list.md'),
        mdTexts.join('\n'),
      );
    })();

    await (async () => {
      const gameAllJson = await Bun.file(
        path.join(argvUtils.getArgv()['outputDir'], 'akEndfield', 'launcher', 'game', channelStr, 'all_patch.json'),
      ).json();
      const mdTexts: string[] = [];
      mdTexts.push(
        ...[
          '# Game Patch Packages\n',
          ...gameAllJson.map(
            (e: any) =>
              `- [${e.rsp.request_version} → ${e.rsp.version} (${DateTime.fromISO(e.updatedAt, { setZone: true }).setZone('UTC+8').toFormat('yyyy/MM/dd HH:mm:ss')})](#ver-${e.rsp.request_version}-${e.rsp.version}-${Math.ceil(DateTime.fromISO(e.updatedAt).toSeconds())})`,
          ),
          '',
        ],
        ...gameAllJson.map((e: any) =>
          [
            `<h2 id="ver-${e.rsp.request_version}-${e.rsp.version}-${Math.ceil(DateTime.fromISO(e.updatedAt).toSeconds())}">${e.rsp.request_version} → ${e.rsp.version} (${DateTime.fromISO(e.updatedAt, { setZone: true }).setZone('UTC+8').toFormat('yyyy/MM/dd HH:mm:ss')})</h2>\n`,
            `<table>`,
            `  <tr><td>Unpacked Size</td><td style="text-align: right;"><b>${mathUtils.formatFileSize(
              e.rsp.patch.total_size -
                mathUtils.arrayTotal(e.rsp.patch.patches.map((f: any) => parseInt(f.package_size))),
              {
                decimals: 2,
                decimalPadding: true,
                unitVisible: true,
                useBinaryUnit: true,
                useBitUnit: false,
                unit: null,
              },
            )}</b></td></tr>`,
            `  <tr><td>Packed Size</td><td style="text-align: right;"><b>${mathUtils.formatFileSize(mathUtils.arrayTotal(e.rsp.patch.patches.map((f: any) => parseInt(f.package_size))), { decimals: 2, decimalPadding: true, unitVisible: true, useBinaryUnit: true, useBitUnit: false, unit: null })}</b></td></tr>`,
            `</table>\n`,
            `|File|MD5 Checksum|Size|`,
            `|:--|:--|--:|`,
            ...(e.rsp.patch.url
              ? [
                  `|[${new URL(e.rsp.patch.url).pathname.split('/').pop() ?? ''}](${e.rsp.patch.url})|\`${e.rsp.patch.md5}\`|${mathUtils.formatFileSize(parseInt(e.rsp.patch.package_size), { decimals: 2, decimalPadding: true, unitVisible: true, useBinaryUnit: true, useBitUnit: false, unit: null })}|`,
                ]
              : []),
            ...e.rsp.patch.patches.map((f: any) => [
              `|[${new URL(f.url).pathname.split('/').pop() ?? ''}](${f.url})|\`${f.md5}\`|${mathUtils.formatFileSize(parseInt(f.package_size), { decimals: 2, decimalPadding: true, unitVisible: true, useBinaryUnit: true, useBitUnit: false, unit: null })}|`,
            ]),
            '',
          ].join('\n'),
        ),
      );
      await Bun.write(
        path.join(argvUtils.getArgv()['outputDir'], 'akEndfield', 'launcher', 'game', channelStr, 'list_patch.md'),
        mdTexts.join('\n'),
      );
    })();

    await (async () => {
      const mdTexts: string[] = [];
      mdTexts.push(
        '# Game Resources\n',
        '- [Windows](#res-Windows)',
        '- [Android](#res-Android)',
        '- [iOS](#res-iOS)',
        '- [PlayStation](#res-PlayStation)\n',
      );
      // `<h2 id="ver-${e.rsp.version}-${Math.ceil(DateTime.fromISO(e.updatedAt).toSeconds())}">${e.rsp.version} (${DateTime.fromISO(e.updatedAt, { setZone: true }).setZone('UTC+8').toFormat('yyyy/MM/dd HH:mm:ss')})</h2>\n`

      const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;

      for (const platform of platforms) {
        const gameAllJson = await Bun.file(
          path.join(
            argvUtils.getArgv()['outputDir'],
            'akEndfield',
            'launcher',
            'game_resources',
            channelStr,
            platform,
            'all.json',
          ),
        ).json();
        const resVersionSet: {
          resVersion: string;
          rsp: { rsp: Awaited<ReturnType<typeof apiUtils.apiAkEndfield.launcher.latestGameResources>> };
          versions: string[];
        }[] = (() => {
          const resVersions: string[] = [...new Set(gameAllJson.map((e: any) => e.rsp.res_version))] as string[];
          const arr: { resVersion: string; rsp: any; versions: string[] }[] = [];
          for (const resVersion of resVersions) {
            arr.push({
              resVersion,
              rsp: gameAllJson.find((e: any) => e.rsp.res_version === resVersion),
              versions: [
                ...new Set(
                  gameAllJson.filter((e: any) => e.rsp.res_version === resVersion).map((e: any) => e.req.version),
                ),
              ] as string[],
            });
          }
          return arr;
        })();
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
        path.join(argvUtils.getArgv()['outputDir'], 'akEndfield', 'launcher', 'game_resources', channelStr, 'list.md'),
        mdTexts.join('\n'),
      );
    })();
  })();
}

export default mainCmdHandler;
