import ky from 'ky';
import semver from 'semver';
import * as TypesApiAkEndfield from '../types/api/akEndfield/api.js';
import appConfig from './config.js';

const defaultKySettings = {
  headers: {
    'User-Agent': appConfig.network.userAgent.minimum,
  },
  timeout: appConfig.network.timeout,
  retry: { limit: appConfig.network.retryCount },
};

const launcherWebLang = [
  'de-de',
  'en-us',
  'es-mx',
  'fr-fr',
  'id-id',
  'it-it',
  'ja-jp',
  'ko-kr',
  'pt-br',
  'ru-ru',
  'th-th',
  'vi-vn',
  'zh-cn',
  'zh-tw',
] as const;

export default {
  defaultKySettings,
  apiAkEndfield: {
    launcher: {
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
            ...defaultKySettings,
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
        platform: 'Windows' = 'Windows',
      ): Promise<TypesApiAkEndfield.LauncherLatestGameResources> => {
        if (!semver.valid(version)) throw new Error(`Invalid version string (${version})`);
        const rsp = await ky
          .get(`https://${appConfig.network.api.akEndfield.base.launcher}/game/get_latest_resources`, {
            ...defaultKySettings,
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
            ...defaultKySettings,
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
      web: {
        sidebar: async (
          appCode: string,
          channel: number,
          subChannel: number,
          language: (typeof launcherWebLang)[number],
          platform: 'Windows' = 'Windows',
        ): Promise<TypesApiAkEndfield.LauncherWebSidebar> => {
          const rsp = await ky
            .post(`https://${appConfig.network.api.akEndfield.base.launcher}/proxy/web/batch_proxy`, {
              ...defaultKySettings,
              json: {
                proxy_reqs: [
                  {
                    kind: 'get_sidebar',
                    get_sidebar_req: {
                      appcode: appCode,
                      channel: String(channel),
                      sub_channel: String(subChannel),
                      language,
                      platform,
                      source: 'launcher',
                    },
                  },
                ],
              },
            })
            .json();
          return (rsp as any).proxy_rsps[0].get_sidebar_rsp as TypesApiAkEndfield.LauncherWebSidebar;
        },
        singleEnt: async (
          appCode: string,
          channel: number,
          subChannel: number,
          language: (typeof launcherWebLang)[number],
          platform: 'Windows' = 'Windows',
        ): Promise<TypesApiAkEndfield.LauncherWebSingleEnt> => {
          const rsp = await ky
            .post(`https://${appConfig.network.api.akEndfield.base.launcher}/proxy/web/batch_proxy`, {
              ...defaultKySettings,
              json: {
                proxy_reqs: [
                  {
                    kind: 'get_single_ent',
                    get_single_ent_req: {
                      appcode: appCode,
                      channel: String(channel),
                      sub_channel: String(subChannel),
                      language,
                      platform,
                      source: 'launcher',
                    },
                  },
                ],
              },
            })
            .json();
          return (rsp as any).proxy_rsps[0].get_single_ent_rsp as TypesApiAkEndfield.LauncherWebSingleEnt;
        },
        mainBgImage: async (
          appCode: string,
          channel: number,
          subChannel: number,
          language: (typeof launcherWebLang)[number],
          platform: 'Windows' = 'Windows',
        ): Promise<TypesApiAkEndfield.LauncherWebMainBgImage> => {
          const rsp = await ky
            .post(`https://${appConfig.network.api.akEndfield.base.launcher}/proxy/web/batch_proxy`, {
              ...defaultKySettings,
              json: {
                proxy_reqs: [
                  {
                    kind: 'get_main_bg_image',
                    get_main_bg_image_req: {
                      appcode: appCode,
                      channel: String(channel),
                      sub_channel: String(subChannel),
                      language,
                      platform,
                      source: 'launcher',
                    },
                  },
                ],
              },
            })
            .json();
          return (rsp as any).proxy_rsps[0].get_main_bg_image_rsp as TypesApiAkEndfield.LauncherWebMainBgImage;
        },
        banner: async (
          appCode: string,
          channel: number,
          subChannel: number,
          language: (typeof launcherWebLang)[number],
          platform: 'Windows' = 'Windows',
        ): Promise<TypesApiAkEndfield.LauncherWebBanner> => {
          const rsp = await ky
            .post(`https://${appConfig.network.api.akEndfield.base.launcher}/proxy/web/batch_proxy`, {
              ...defaultKySettings,
              json: {
                proxy_reqs: [
                  {
                    kind: 'get_banner',
                    get_banner_req: {
                      appcode: appCode,
                      channel: String(channel),
                      sub_channel: String(subChannel),
                      language,
                      platform,
                      source: 'launcher',
                    },
                  },
                ],
              },
            })
            .json();
          return (rsp as any).proxy_rsps[0].get_banner_rsp as TypesApiAkEndfield.LauncherWebBanner;
        },
        announcement: async (
          appCode: string,
          channel: number,
          subChannel: number,
          language: (typeof launcherWebLang)[number],
          platform: 'Windows' = 'Windows',
        ): Promise<TypesApiAkEndfield.LauncherWebAnnouncement> => {
          const rsp = await ky
            .post(`https://${appConfig.network.api.akEndfield.base.launcher}/proxy/web/batch_proxy`, {
              ...defaultKySettings,
              json: {
                proxy_reqs: [
                  {
                    kind: 'get_announcement',
                    get_announcement_req: {
                      appcode: appCode,
                      channel: String(channel),
                      sub_channel: String(subChannel),
                      language,
                      platform,
                      source: 'launcher',
                    },
                  },
                ],
              },
            })
            .json();
          return (rsp as any).proxy_rsps[0].get_announcement_rsp as TypesApiAkEndfield.LauncherWebAnnouncement;
        },
      },
    },
  },
};
