import path from 'node:path';
import { DateTime } from 'luxon';
import semver from 'semver';
import apiUtils from '../utils/api.js';
import argvUtils from '../utils/argv.js';
import appConfig from '../utils/config.js';
import logger from '../utils/logger.js';

async function mainCmdHandler() {
  const cfg = appConfig.network.api.akEndfield;

  await (async () => {
    const channel = appConfig.network.api.akEndfield.channel.osWinRel;
    logger.debug('apiAkEndfield.launcher.latestGame fetching ...');
    console.log(
      await apiUtils.apiAkEndfield.launcher.latestGame(
        appConfig.network.api.akEndfield.appCode.osWinRel,
        appConfig.network.api.akEndfield.launcherAppCode.osWinRel,
        channel,
        channel,
        channel,
        null,
      ),
    );
    logger.debug('apiAkEndfield.launcher.latestLauncher fetching ...');
    console.log(
      await apiUtils.apiAkEndfield.launcher.latestLauncher(
        appConfig.network.api.akEndfield.launcherAppCode.osWinRel,
        channel,
        channel,
        null,
        null,
      ),
    );
    logger.debug('apiAkEndfield.launcher.web fetching ...');
    for (const fn of [
      apiUtils.apiAkEndfield.launcher.web.sidebar,
      apiUtils.apiAkEndfield.launcher.web.singleEnt,
      apiUtils.apiAkEndfield.launcher.web.mainBgImage,
      apiUtils.apiAkEndfield.launcher.web.banner,
      apiUtils.apiAkEndfield.launcher.web.announcement,
    ]) {
      console.dir(await fn(appConfig.network.api.akEndfield.appCode.osWinRel, channel, channel, 'ja-jp'), {
        depth: null,
      });
    }
  })();

  await (async () => {
    const rsp = await apiUtils.apiAkEndfield.launcher.latestGame(
      cfg.appCode.osWinRel,
      cfg.launcherAppCode.osWinRel,
      cfg.channel.osWinRel,
      cfg.channel.osWinRel,
      cfg.channel.osWinRel,
      null,
    );
    const prettyRsp = {
      req: {
        appCode: cfg.appCode.osWinRel,
        launcherAppCode: cfg.launcherAppCode.osWinRel,
        channel: cfg.channel.osWinRel,
        subChannel: cfg.channel.osWinRel,
        launcherSubChannel: cfg.channel.osWinRel,
      },
      rsp,
    };
    const filePathBase = path.join(
      argvUtils.getArgv()['outputDir'],
      'akEndfield',
      'launcher',
      'game',
      String(cfg.channel.osWinRel),
    );
    for (const filePath of [path.join(filePathBase, 'latest.json'), path.join(filePathBase, `v${rsp.version}.json`)]) {
      if (
        (await Bun.file(filePath).exists()) === false ||
        JSON.stringify(await Bun.file(filePath).json()) !== JSON.stringify(prettyRsp)
      ) {
        await Bun.write(filePath, JSON.stringify(prettyRsp, null, 2));
      }
    }
    await (async () => {
      let needWrite: boolean = true;
      const tmp: ({ updatedAt: string } & typeof prettyRsp)[] = await Bun.file(
        path.join(filePathBase, 'all.json'),
      ).json();
      for (const dataStr of tmp.map((e) => JSON.stringify({ req: e.req, rsp: e.rsp }))) {
        if (dataStr === JSON.stringify(prettyRsp)) {
          needWrite = false;
        }
      }
      if (needWrite) {
        tmp.push({ updatedAt: DateTime.now().toISO(), ...prettyRsp });
        await Bun.write(path.join(filePathBase, 'all.json'), JSON.stringify(tmp, null, 2));
      }
    })();
  })();

  await (async () => {
    const versionInfoList = (
      (
        await Bun.file(
          path.join(
            argvUtils.getArgv()['outputDir'],
            'akEndfield',
            'launcher',
            'game',
            String(cfg.channel.osWinRel),
            'all.json',
          ),
        ).json()
      ).map((e: any) => e.rsp) as Awaited<ReturnType<typeof apiUtils.apiAkEndfield.launcher.latestGame>>[]
    )
      .map((e) => ({
        version: e.version,
        versionMinor: semver.major(e.version) + '.' + semver.minor(e.version),
        randStr: /_([^/]+)\/.+?$/.exec(e.pkg.file_path)![1],
      }))
      .sort((a, b) => semver.compare(b.version, a.version));
    const filePathBase = path.join(
      argvUtils.getArgv()['outputDir'],
      'akEndfield',
      'launcher',
      'game_resources',
      String(cfg.channel.osWinRel),
    );
    let isLatestWrote: boolean = false;
    for (const versionInfoEntry of versionInfoList) {
      if (!versionInfoEntry.randStr) throw new Error('version rand_str not found');
      const rsp = await apiUtils.apiAkEndfield.launcher.latestGameResources(
        cfg.appCode.osWinRel,
        versionInfoEntry.versionMinor,
        versionInfoEntry.version,
        versionInfoEntry.randStr,
      );
      const prettyRsp = {
        req: {
          appCode: cfg.appCode.osWinRel,
          gameVersion: versionInfoEntry.versionMinor,
          version: versionInfoEntry.version,
          randStr: versionInfoEntry.randStr,
        },
        rsp,
      };
      if (isLatestWrote === false) {
        if (
          (await Bun.file(path.join(filePathBase, 'latest.json')).exists()) === false ||
          JSON.stringify(await Bun.file(path.join(filePathBase, 'latest.json')).json()) !== JSON.stringify(prettyRsp)
        ) {
          await Bun.write(path.join(filePathBase, 'latest.json'), JSON.stringify(prettyRsp, null, 2));
        }
        isLatestWrote = true;
      }
      for (const filePath of [path.join(filePathBase, `v${versionInfoEntry.version}.json`)]) {
        if (
          (await Bun.file(filePath).exists()) === false ||
          JSON.stringify(await Bun.file(filePath).json()) !== JSON.stringify(prettyRsp)
        ) {
          await Bun.write(filePath, JSON.stringify(prettyRsp, null, 2));
        }
      }
      await (async () => {
        let needWrite: boolean = true;
        const tmp: ({ updatedAt: string } & typeof prettyRsp)[] = await Bun.file(
          path.join(filePathBase, 'all.json'),
        ).json();
        for (const dataStr of tmp.map((e) => JSON.stringify({ req: e.req, rsp: e.rsp }))) {
          if (dataStr === JSON.stringify(prettyRsp)) needWrite = false;
        }
        if (needWrite) {
          tmp.push({ updatedAt: DateTime.now().toISO(), ...prettyRsp });
          await Bun.write(path.join(filePathBase, 'all.json'), JSON.stringify(tmp, null, 2));
        }
      })();
    }
  })();

  await (async () => {
    const launcherTargetAppList = ['EndField', 'official'] as const;
    for (const launcherTargetAppEntry of launcherTargetAppList) {
      const rsp = await apiUtils.apiAkEndfield.launcher.latestLauncher(
        cfg.launcherAppCode.osWinRel,
        cfg.channel.osWinRel,
        cfg.channel.osWinRel,
        null,
        launcherTargetAppEntry === 'official' ? null : launcherTargetAppEntry,
      );
      const prettyRsp = {
        req: {
          appCode: cfg.launcherAppCode.osWinRel,
          channel: cfg.channel.osWinRel,
          subChannel: cfg.channel.osWinRel,
          targetApp: launcherTargetAppEntry === 'official' ? null : launcherTargetAppEntry,
        },
        rsp,
      };
      const filePathBase = path.join(
        argvUtils.getArgv()['outputDir'],
        'akEndfield',
        'launcher',
        'launcher',
        launcherTargetAppEntry,
        String(cfg.channel.osWinRel),
      );
      for (const filePath of [
        path.join(filePathBase, 'latest.json'),
        path.join(filePathBase, `v${rsp.version}.json`),
      ]) {
        if (
          (await Bun.file(filePath).exists()) === false ||
          JSON.stringify(await Bun.file(filePath).json()) !== JSON.stringify(prettyRsp)
        ) {
          await Bun.write(filePath, JSON.stringify(prettyRsp, null, 2));
        }
      }
      await (async () => {
        let needWrite: boolean = true;
        const tmp: ({ updatedAt: string } & typeof prettyRsp)[] = await Bun.file(
          path.join(filePathBase, 'all.json'),
        ).json();
        for (const dataStr of tmp.map((e) => JSON.stringify({ req: e.req, rsp: e.rsp }))) {
          if (dataStr === JSON.stringify(prettyRsp)) {
            needWrite = false;
          }
        }
        if (needWrite) {
          tmp.push({ updatedAt: DateTime.now().toISO(), ...prettyRsp });
          await Bun.write(path.join(filePathBase, 'all.json'), JSON.stringify(tmp, null, 2));
        }
      })();
    }
  })();
}

export default mainCmdHandler;
