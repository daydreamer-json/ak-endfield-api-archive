import defaultSettings from '../../utils/api/akEndfield/defaultSettings.js';
import appConfig from '../../utils/config.js';
import type { BulletinTarget, GameTarget, LauncherTarget } from './types.js';

export const DIFF_IGNORE_RULES = [
  ['rsp', 'pkg', 'url'],
  ['rsp', 'pkg', 'packs', '*', 'url'],
  ['rsp', 'patch', 'url'],
  ['rsp', 'patch', 'patches', '*', 'url'],
  ['rsp', 'zip_package_url'],
  ['rsp', 'exe_url'],
  ['rsp', 'patch', 'v2_patch_info_url'],
  ['rsp', 'patch', 'v2_verify_files_url'],
].map((path) => ({ path, pattern: /[?&]auth_key=[^&]+/g }));

export const getGameTargets = (): GameTarget[] => {
  const cfg = appConfig.network.api.akEndfield;
  return [
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
};

export const getLauncherTargets = (): LauncherTarget[] => {
  const cfg = appConfig.network.api.akEndfield;
  return [
    { id: 'os', apps: ['EndField', 'Official'], code: cfg.appCode.launcher.osWinRel, channel: cfg.channel.osWinRel },
    {
      id: 'cn',
      apps: ['EndField', 'Arknights', 'Official'],
      code: cfg.appCode.launcher.cnWinRel,
      channel: cfg.channel.cnWinRel,
    },
  ];
};

export const getBulletinTargets = (): BulletinTarget[] => {
  const cfg = appConfig.network.api.akEndfield;
  return [
    {
      region: 'os',
      channel: cfg.channel.osWinRel,
      server: cfg.bulletin.server.os,
      langs: defaultSettings.launcherWebLang,
    },
    {
      region: 'cn',
      channel: cfg.channel.cnWinRel,
      server: cfg.bulletin.server.cn,
      langs: defaultSettings.launcherWebLangCN,
    },
    {
      region: 'cn',
      channel: cfg.channel.cnWinRelBilibili,
      server: cfg.bulletin.server.cn,
      langs: defaultSettings.launcherWebLangCN,
    },
  ];
};
