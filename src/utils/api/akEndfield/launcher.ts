import ky from 'ky';
import semver from 'semver';
import * as TypesApiAkEndfield from '../../../types/api/akEndfield/Api.js';
import appConfig from '../../config.js';
import defaultSettings from './defaultSettings.js';

import launcherWeb from './launcherWeb.js';

export default {
  latestGame: async (
    appCode: string,
    launcherAppCode: string,
    channel: number,
    subChannel: number,
    launcherSubChannel: number,
    version: string | null,
    region: 'os' | 'cn',
  ): Promise<TypesApiAkEndfield.LauncherLatestGame> => {
    if (version !== null && !semver.valid(version)) throw new Error(`Invalid version string (${version})`);
    const apiBase =
      region === 'cn'
        ? appConfig.network.api.akEndfield.base.launcherCN
        : appConfig.network.api.akEndfield.base.launcher;
    const rsp = await ky
      .get(`https://${apiBase}/game/get_latest`, {
        ...defaultSettings.ky,
        searchParams: {
          appcode: appCode,
          launcher_appcode: launcherAppCode,
          channel,
          sub_channel: subChannel,
          launcher_sub_channel: launcherSubChannel,
          version: version ?? undefined,
        },
      })
      .json();
    return rsp as TypesApiAkEndfield.LauncherLatestGame;
  },
  latestGameResources: async (
    appCode: string,
    gameVersion: string, // example: 1.0
    version: string,
    randStr: string,
    platform: 'Windows' | 'Android' | 'iOS' | 'PlayStation',
    region: 'os' | 'cn',
  ): Promise<TypesApiAkEndfield.LauncherLatestGameResources> => {
    if (!semver.valid(version)) throw new Error(`Invalid version string (${version})`);
    const apiBase =
      region === 'cn'
        ? appConfig.network.api.akEndfield.base.launcherCN
        : appConfig.network.api.akEndfield.base.launcher;
    const rsp = await ky
      .get(`https://${apiBase}/game/get_latest_resources`, {
        ...defaultSettings.ky,
        searchParams: {
          appcode: appCode,
          game_version: gameVersion,
          version: version,
          platform,
          rand_str: randStr,
        },
      })
      .json();
    return rsp as TypesApiAkEndfield.LauncherLatestGameResources;
  },
  latestLauncher: async (
    appCode: string,
    channel: number,
    subChannel: number,
    version: string | null,
    targetApp: 'EndField' | 'Arknights' | 'Official',
    region: 'os' | 'cn',
  ): Promise<TypesApiAkEndfield.LauncherLatestLauncher> => {
    if (version !== null && !semver.valid(version)) throw new Error(`Invalid version string (${version})`);
    const apiBase =
      region === 'cn'
        ? appConfig.network.api.akEndfield.base.launcherCN
        : appConfig.network.api.akEndfield.base.launcher;
    const rsp = await ky
      .get(`https://${apiBase}/launcher/get_latest`, {
        ...defaultSettings.ky,
        searchParams: {
          appcode: appCode,
          channel,
          sub_channel: subChannel,
          version: version ?? undefined,
          target_app: targetApp,
        },
      })
      .json();
    return rsp as TypesApiAkEndfield.LauncherLatestLauncher;
  },
  latestLauncherExe: async (
    appCode: string,
    channel: number,
    subChannel: number,
    version: string | null,
    targetApp: 'endfield' | 'official' | string,
    region: 'os' | 'cn',
  ): Promise<TypesApiAkEndfield.LauncherLatestLauncherExe> => {
    if (version !== null && !semver.valid(version)) throw new Error(`Invalid version string (${version})`);
    const apiBase =
      region === 'cn'
        ? appConfig.network.api.akEndfield.base.launcherCN
        : appConfig.network.api.akEndfield.base.launcher;
    const rsp = await ky
      .get(`https://${apiBase}/launcher/get_latest_launcher`, {
        ...defaultSettings.ky,
        searchParams: {
          appcode: appCode,
          channel,
          sub_channel: subChannel,
          version: version ?? undefined,
          ta: targetApp,
        },
      })
      .json();
    return rsp as TypesApiAkEndfield.LauncherLatestLauncherExe;
  },
  web: launcherWeb,
};
