import ky from 'ky';
import * as TypesApiAkEndfield from '../../types/api/akEndfield/Api.js';
import appConfig from '../config.js';
import defaultSettings from './defaultSettings.js';

export default {
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
              ...defaultSettings.ky,
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
              ...defaultSettings.ky,
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
              ...defaultSettings.ky,
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
              ...defaultSettings.ky,
              json: { token, serverId: String(serverId) },
            })
            .json();
          return rsp as TypesApiAkEndfield.U8GameRoleV1ConfirmServer;
        },
      },
    },
  },
};
