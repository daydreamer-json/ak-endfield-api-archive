import ky from 'ky';
import * as TypesApiAkEndfield from '../../types/api/akEndfield/Api.js';
import appConfig from '../config.js';
import defaultSettings from './defaultSettings.js';

export default {
  account: {
    binding: {
      v1: {
        bindingList: async (
          // appCode: 'arknights' | 'endfield',
          token: string,
        ): Promise<TypesApiAkEndfield.BindApiAccBindV1BindList> => {
          const rsp = await ky
            .get(`https://${appConfig.network.api.akEndfield.base.binding}/account/binding/v1/binding_list`, {
              ...defaultSettings.ky,
              searchParams: { token },
            })
            .json();
          return rsp as TypesApiAkEndfield.BindApiAccBindV1BindList;
        },
        u8TokenByUid: async (token: string, uid: string): Promise<TypesApiAkEndfield.BindApiAccBindV1U8TokenByUid> => {
          const rsp = await ky
            .post(`https://${appConfig.network.api.akEndfield.base.binding}/account/binding/v1/u8_token_by_uid`, {
              ...defaultSettings.ky,
              json: { token, uid },
            })
            .json();
          return rsp as TypesApiAkEndfield.BindApiAccBindV1U8TokenByUid;
        },
      },
    },
  },
};
