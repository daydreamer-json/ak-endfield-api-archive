import ky from 'ky';
import * as TypesApiAkEndfield from '../../types/api/akEndfield/Api.js';
import appConfig from '../config.js';
import defaultSettings from './defaultSettings.js';

export default {
  record: {
    char: async (
      token: string,
      serverId: number, // 2 or 3
      poolType:
        | 'E_CharacterGachaPoolType_Beginner'
        | 'E_CharacterGachaPoolType_Standard'
        | 'E_CharacterGachaPoolType_Special',
      seqId: string | null,
      lang: (typeof defaultSettings.launcherWebLang)[number] = 'ja-jp',
    ): Promise<TypesApiAkEndfield.WebViewRecordChar> => {
      const rsp = await ky
        .get(`https://${appConfig.network.api.akEndfield.base.webview}/api/record/char`, {
          ...defaultSettings.ky,
          searchParams: { lang, seq_id: seqId ?? undefined, pool_type: poolType, token, server_id: serverId },
        })
        .json();
      return rsp as TypesApiAkEndfield.WebViewRecordChar;
    },
  },
  content: async (
    serverId: number, // 2 or 3
    poolId: string,
    lang: (typeof defaultSettings.launcherWebLang)[number] = 'ja-jp',
  ): Promise<TypesApiAkEndfield.WebViewRecordContent> => {
    const rsp = await ky
      .get(`https://${appConfig.network.api.akEndfield.base.webview}/api/content`, {
        ...defaultSettings.ky,
        searchParams: { lang, pool_id: poolId, server_id: serverId },
      })
      .json();
    return rsp as TypesApiAkEndfield.WebViewRecordContent;
  },
};
