import path from 'node:path';
import { DateTime } from 'luxon';
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
    logger.debug('Fetching latestGameRes ...');

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
    let isLatestWrote: boolean = false;
    for (const versionInfoEntry of versionInfoList) {
      if (!versionInfoEntry.randStr) throw new Error('version rand_str not found');
      const rsp = await apiUtils.apiAkEndfield.launcher.latestGameResources(
        cfg.appCode.game.osWinRel,
        versionInfoEntry.versionMinor,
        versionInfoEntry.version,
        versionInfoEntry.randStr,
      );
      logger.info(`Fetched latestGameRes: v${versionInfoEntry.version}, ${rsp.res_version}`);
      const prettyRsp = {
        req: {
          appCode: cfg.appCode.game.osWinRel,
          gameVersion: versionInfoEntry.versionMinor,
          version: versionInfoEntry.version,
          randStr: versionInfoEntry.randStr,
        },
        rsp,
      };

      await saveResult(
        ['akEndfield', 'launcher', 'game_resources', channelStr],
        versionInfoEntry.version,
        prettyRsp,
        !isLatestWrote,
      );
      isLatestWrote = true;
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
}

export default mainCmdHandler;
