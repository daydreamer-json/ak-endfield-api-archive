import kyFactory from 'ky';
import * as TypesApiAkEndfield from '../../../types/api/akEndfield/Api.js';
import appConfig from '../../config.js';

export default class Binding {
  constructor(private ky: typeof kyFactory) {}

  account = {
    binding: {
      v1: {
        bindingList: async (
          // appCode: 'arknights' | 'endfield',
          token: string,
        ): Promise<TypesApiAkEndfield.BindApiAccBindV1BindList> => {
          const rsp = await this.ky
            .get(`https://${appConfig.network.api.akEndfield.base.binding}/account/binding/v1/binding_list`, {
              searchParams: { token },
            })
            .json();
          return rsp as TypesApiAkEndfield.BindApiAccBindV1BindList;
        },
        u8TokenByUid: async (token: string, uid: string): Promise<TypesApiAkEndfield.BindApiAccBindV1U8TokenByUid> => {
          const rsp = await this.ky
            .post(`https://${appConfig.network.api.akEndfield.base.binding}/account/binding/v1/u8_token_by_uid`, {
              json: { token, uid },
            })
            .json();
          return rsp as TypesApiAkEndfield.BindApiAccBindV1U8TokenByUid;
        },
      },
    },
  };
}
