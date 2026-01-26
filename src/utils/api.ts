import ky from 'ky';
import semver from 'semver';
import * as TypesApiAkEndfield from '../types/api/akEndfield/Api.js';
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
        platform: 'Windows' | 'Android' | 'iOS' | 'PlayStation',
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
    accountService: {
      user: {
        auth: {
          v1: {
            tokenByEmailPassword: async (
              email: string,
              password: string,
              from: number = 0,
            ): Promise<TypesApiAkEndfield.AccSrvUserAuthV1TokenByEmail> => {
              const rsp = await ky
                .post(
                  `https://${appConfig.network.api.akEndfield.base.accountService}/user/auth/v1/token_by_email_password`,
                  { ...defaultKySettings, json: { email, from, password } },
                )
                .json();
              return rsp as TypesApiAkEndfield.AccSrvUserAuthV1TokenByEmail;
            },
          },
        },
        oauth2: {
          v2: {
            grant: async <T extends 0 | 1 = 0>(
              appCode: string,
              token: string,
              type: T = 0 as any, // 0 = return grant uid (Gxxxxxxxxx) and code, 1 = return hgId and token
            ): Promise<
              T extends 0 ? TypesApiAkEndfield.AccSrvUserOAuth2V2Grant : TypesApiAkEndfield.AccSrvUserOAuth2V2GrantType1
            > => {
              const rsp = await ky
                .post(`https://${appConfig.network.api.akEndfield.base.accountService}/user/oauth2/v2/grant`, {
                  ...defaultKySettings,
                  json: { appCode, token, type },
                })
                .json();
              return rsp as any;
            },
          },
        },
        info: {
          v1: {
            basic: async (appCode: string, token: string): Promise<TypesApiAkEndfield.AccSrvUserInfoV1Basic> => {
              const rsp = await ky
                .get(`https://${appConfig.network.api.akEndfield.base.accountService}/user/info/v1/basic`, {
                  ...defaultKySettings,
                  searchParams: { appCode, token },
                })
                .json();
              return rsp as TypesApiAkEndfield.AccSrvUserInfoV1Basic;
            },
            thirdParty: async (
              appCode: string,
              token: string,
            ): Promise<TypesApiAkEndfield.AccSrvUserInfoV1ThirdParty> => {
              const rsp = await ky
                .get(`https://${appConfig.network.api.akEndfield.base.accountService}/user/info/v1/third_party`, {
                  ...defaultKySettings,
                  searchParams: { appCode, token },
                })
                .json();
              return rsp as TypesApiAkEndfield.AccSrvUserInfoV1ThirdParty;
            },
          },
        },
      },
    },
    u8: {
      user: {
        auth: {
          v2: {
            tokenByChToken: async (
              appCode: string,
              channelMasterId: number,
              channelToken: string,
              platform: number = 2,
              type: number = 0,
            ): Promise<TypesApiAkEndfield.U8UserAuthV2ChToken> => {
              const rsp = await ky
                .post(`https://${appConfig.network.api.akEndfield.base.u8}/u8/user/auth/v2/token_by_channel_token`, {
                  ...defaultKySettings,
                  json: {
                    appCode,
                    channelMasterId,
                    channelToken: JSON.stringify({
                      code: channelToken,
                      type: 1,
                      isSuc: true,
                    }),
                    type,
                    platform,
                  },
                })
                .json();
              return rsp as TypesApiAkEndfield.U8UserAuthV2ChToken;
            },
            grant: async (
              token: string,
              platform: number = 2,
              type: number = 0,
            ): Promise<TypesApiAkEndfield.U8UserAuthV2Grant> => {
              const rsp = await ky
                .post(`https://${appConfig.network.api.akEndfield.base.u8}/u8/user/auth/v2/grant`, {
                  ...defaultKySettings,
                  json: { token, type, platform },
                })
                .json();
              return rsp as TypesApiAkEndfield.U8UserAuthV2Grant;
            },
          },
        },
      },
      game: {
        server: {
          v1: {
            serverList: async (token: string): Promise<TypesApiAkEndfield.U8GameServerV1ServerList> => {
              const rsp = await ky
                .post(`https://${appConfig.network.api.akEndfield.base.u8}/game/server/v1/server_list`, {
                  ...defaultKySettings,
                  json: { token },
                })
                .json();
              return rsp as TypesApiAkEndfield.U8GameServerV1ServerList;
            },
          },
        },
        role: {
          v1: {
            confirmServer: async (
              token: string,
              serverId: number,
            ): Promise<TypesApiAkEndfield.U8GameRoleV1ConfirmServer> => {
              const rsp = await ky
                .post(`https://${appConfig.network.api.akEndfield.base.u8}/game/role/v1/confirm_server`, {
                  ...defaultKySettings,
                  json: { token, serverId: String(serverId) },
                })
                .json();
              return rsp as TypesApiAkEndfield.U8GameRoleV1ConfirmServer;
            },
          },
        },
      },
    },
    binding: {
      account: {
        binding: {
          v1: {
            bindingList: async (
              // appCode: 'arknights' | 'endfield',
              token: string,
            ): Promise<TypesApiAkEndfield.BindApiAccBindV1BindList> => {
              const rsp = await ky
                .get(`https://${appConfig.network.api.akEndfield.base.binding}/account/binding/v1/binding_list`, {
                  ...defaultKySettings,
                  searchParams: { token },
                })
                .json();
              return rsp as TypesApiAkEndfield.BindApiAccBindV1BindList;
            },
            u8TokenByUid: async (
              token: string,
              uid: string,
            ): Promise<TypesApiAkEndfield.BindApiAccBindV1U8TokenByUid> => {
              const rsp = await ky
                .post(`https://${appConfig.network.api.akEndfield.base.binding}/account/binding/v1/u8_token_by_uid`, {
                  ...defaultKySettings,
                  json: { token, uid },
                })
                .json();
              return rsp as TypesApiAkEndfield.BindApiAccBindV1U8TokenByUid;
            },
          },
        },
      },
    },
    webview: {
      record: {
        char: async (
          token: string,
          serverId: number, // 2 or 3
          poolType:
            | 'E_CharacterGachaPoolType_Beginner'
            | 'E_CharacterGachaPoolType_Standard'
            | 'E_CharacterGachaPoolType_Special',
          seqId: string | null,
          lang: (typeof launcherWebLang)[number] = 'ja-jp',
        ): Promise<TypesApiAkEndfield.WebViewRecordChar> => {
          const rsp = await ky
            .get(`https://${appConfig.network.api.akEndfield.base.webview}/api/record/char`, {
              ...defaultKySettings,
              searchParams: { lang, seq_id: seqId ?? undefined, pool_type: poolType, token, server_id: serverId },
            })
            .json();
          return rsp as TypesApiAkEndfield.WebViewRecordChar;
        },
      },
      content: async (
        serverId: number, // 2 or 3
        poolId: string,
        lang: (typeof launcherWebLang)[number] = 'ja-jp',
      ): Promise<TypesApiAkEndfield.WebViewRecordContent> => {
        const rsp = await ky
          .get(`https://${appConfig.network.api.akEndfield.base.webview}/api/content`, {
            ...defaultKySettings,
            searchParams: { lang, pool_id: poolId, server_id: serverId },
          })
          .json();
        return rsp as TypesApiAkEndfield.WebViewRecordContent;
      },
    },
  },
};
