import ky from 'ky';
import * as TypesApiAkEndfield from '../../types/api/akEndfield/Api.js';
import appConfig from '../config.js';
import defaultSettings from './defaultSettings.js';

export default {
  sidebar: async (
    appCode: string,
    channel: number,
    subChannel: number,
    language: (typeof defaultSettings.launcherWebLang)[number],
    platform: 'Windows' = 'Windows',
  ): Promise<TypesApiAkEndfield.LauncherWebSidebar> => {
    const rsp = await ky
      .post(`https://${appConfig.network.api.akEndfield.base.launcher}/proxy/web/batch_proxy`, {
        ...defaultSettings.ky,
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
    language: (typeof defaultSettings.launcherWebLang)[number],
    platform: 'Windows' = 'Windows',
  ): Promise<TypesApiAkEndfield.LauncherWebSingleEnt> => {
    const rsp = await ky
      .post(`https://${appConfig.network.api.akEndfield.base.launcher}/proxy/web/batch_proxy`, {
        ...defaultSettings.ky,
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
    language: (typeof defaultSettings.launcherWebLang)[number],
    platform: 'Windows' = 'Windows',
  ): Promise<TypesApiAkEndfield.LauncherWebMainBgImage> => {
    const rsp = await ky
      .post(`https://${appConfig.network.api.akEndfield.base.launcher}/proxy/web/batch_proxy`, {
        ...defaultSettings.ky,
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
    language: (typeof defaultSettings.launcherWebLang)[number],
    platform: 'Windows' = 'Windows',
  ): Promise<TypesApiAkEndfield.LauncherWebBanner> => {
    const rsp = await ky
      .post(`https://${appConfig.network.api.akEndfield.base.launcher}/proxy/web/batch_proxy`, {
        ...defaultSettings.ky,
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
    language: (typeof defaultSettings.launcherWebLang)[number],
    platform: 'Windows' = 'Windows',
  ): Promise<TypesApiAkEndfield.LauncherWebAnnouncement> => {
    const rsp = await ky
      .post(`https://${appConfig.network.api.akEndfield.base.launcher}/proxy/web/batch_proxy`, {
        ...defaultSettings.ky,
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
};
