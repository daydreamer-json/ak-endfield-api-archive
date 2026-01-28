import ky from 'ky';
import * as TypesApiAkEndfield from '../../types/api/akEndfield/Api.js';
import appConfig from '../config.js';
import defaultSettings from './defaultSettings.js';

export default {
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
              { ...defaultSettings.ky, json: { email, from, password } },
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
              ...defaultSettings.ky,
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
              ...defaultSettings.ky,
              searchParams: { appCode, token },
            })
            .json();
          return rsp as TypesApiAkEndfield.AccSrvUserInfoV1Basic;
        },
        thirdParty: async (appCode: string, token: string): Promise<TypesApiAkEndfield.AccSrvUserInfoV1ThirdParty> => {
          const rsp = await ky
            .get(`https://${appConfig.network.api.akEndfield.base.accountService}/user/info/v1/third_party`, {
              ...defaultSettings.ky,
              searchParams: { appCode, token },
            })
            .json();
          return rsp as TypesApiAkEndfield.AccSrvUserInfoV1ThirdParty;
        },
      },
    },
  },
};
