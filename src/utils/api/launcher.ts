import ky from 'ky';
import semver from 'semver';
import * as TypesApiAkEndfield from '../../types/api/akEndfield/Api.js';
import appConfig from '../config.js';
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
  ): Promise<TypesApiAkEndfield.LauncherLatestGame> => {
    if (version !== null && !semver.valid(version)) throw new Error(`Invalid version string (${version})`);
    const rsp = await ky
      .get(`https://${appConfig.network.api.akEndfield.base.launcher}/game/get_latest`, {
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
  ): Promise<TypesApiAkEndfield.LauncherLatestGameResources> => {
    if (!semver.valid(version)) throw new Error(`Invalid version string (${version})`);
    const rsp = await ky
      .get(`https://${appConfig.network.api.akEndfield.base.launcher}/game/get_latest_resources`, {
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
    targetApp: 'EndField' | null,
  ): Promise<TypesApiAkEndfield.LauncherLatestLauncher> => {
    if (version !== null && !semver.valid(version)) throw new Error(`Invalid version string (${version})`);
    const rsp = await ky
      .get(`https://${appConfig.network.api.akEndfield.base.launcher}/launcher/get_latest`, {
        ...defaultSettings.ky,
        searchParams: {
          appcode: appCode,
          channel,
          sub_channel: subChannel,
          version: version ?? undefined,
          targetApp: targetApp ?? undefined,
        },
      })
      .json();
    return rsp as TypesApiAkEndfield.LauncherLatestLauncher;
  },
  web: launcherWeb,
};
