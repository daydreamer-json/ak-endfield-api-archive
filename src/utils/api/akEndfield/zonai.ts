// https://zonai.skport.com/web/v1/user/auth/generate_cred_by_code

import crypto from 'node:crypto';
import ky from 'ky';
import { DateTime } from 'luxon';
import * as TypesApiAkEndfield from '../../../types/api/akEndfield/Api.js';
import config from '../../config.js';
import defaultSettings from './defaultSettings.js';

const overrideDefSetKy = {
  ...defaultSettings.ky,
  headers: {
    'User-Agent': config.network.userAgent.chromeWindows,
    vname: '1.0.0',
    platform: '3',
  },
};

function calcSignHeader(path: string, cred: string, salt: string) {
  const timestamp = DateTime.now().toUnixInteger().toString();
  const useV2Path: string[] = [
    '/web/v1/wiki/me',
    '/web/v2/user',
    '/api/v1/game/player/binding',
    '/web/v1/game/endfield/attendance',
    '/web/v1/game/endfield/attendance/record',
  ];
  if (useV2Path.includes(path)) {
    const v2Payload = JSON.stringify({
      platform: String(overrideDefSetKy.headers.platform),
      timestamp,
      dId: '',
      vName: overrideDefSetKy.headers.vname,
    });
    return {
      sign: crypto
        .createHash('md5')
        .update(
          crypto
            .createHmac('sha256', salt)
            .update(path + timestamp + v2Payload)
            .digest('hex'),
        )
        .digest('hex'),
      timestamp,
    };
  } else {
    return { sign: crypto.hash('md5', `timestamp=${timestamp}&cred=${cred}`, 'hex'), timestamp };
  }
}

export default {
  web: {
    v1: {
      game: {
        endfield: {
          attendance: {
            get: async (cred: string, token: string, skGameRole: string) => {
              const path = '/web/v1/game/endfield/attendance';
              const rsp = await ky
                .get(`https://${config.network.api.akEndfield.base.zonai}` + path, {
                  ...overrideDefSetKy,
                  headers: {
                    ...overrideDefSetKy.headers,
                    cred,
                    ...calcSignHeader(path, cred, token),
                    'sk-game-role': skGameRole,
                  },
                })
                .json();
              return rsp as TypesApiAkEndfield.ZonaiWebV1GameEndfieldAttendance;
            },
            record: async (cred: string, token: string, skGameRole: string) => {
              const path = '/web/v1/game/endfield/attendance/record';
              const rsp = await ky
                .get(`https://${config.network.api.akEndfield.base.zonai}` + path, {
                  ...overrideDefSetKy,
                  headers: {
                    ...overrideDefSetKy.headers,
                    cred,
                    ...calcSignHeader(path, cred, token),
                    'sk-game-role': skGameRole, // 3_4000000000_2
                  },
                })
                .json();
              return rsp as TypesApiAkEndfield.ZonaiWebV1GameEndfieldAttendanceRecord;
            },
          },
        },
      },
      user: {
        auth: {
          generateCredByCode: async (code: string, kind: 1) => {
            const rsp = await ky
              .post(`https://${config.network.api.akEndfield.base.zonai}/web/v1/user/auth/generate_cred_by_code`, {
                ...overrideDefSetKy,
                headers: { ...overrideDefSetKy.headers },
                json: { kind, code },
              })
              .json();
            return rsp as TypesApiAkEndfield.ZonaiWebV1UserAuthGenCredByCode;
          },
        },
        check: async (cred: string, token: string) => {
          const path = '/web/v1/user/check';
          const rsp = await ky
            .get(`https://${config.network.api.akEndfield.base.zonai}` + path, {
              ...overrideDefSetKy,
              headers: { ...overrideDefSetKy.headers, cred, ...calcSignHeader(path, cred, token) },
            })
            .json();
          return rsp as TypesApiAkEndfield.ZonaiWebV1UserCheck;
        },
      },
      wiki: {
        me: async (cred: string, token: string) => {
          const path = '/web/v1/wiki/me';
          const rsp = await ky
            .get(`https://${config.network.api.akEndfield.base.zonai}` + path, {
              ...overrideDefSetKy,
              headers: { ...overrideDefSetKy.headers, cred, ...calcSignHeader(path, cred, token) },
            })
            .json();
          return rsp as TypesApiAkEndfield.ZonaiWebV1WikiMe;
        },
      },
    },
    v2: {
      user: async (cred: string, token: string) => {
        const path = '/web/v2/user';
        const rsp = await ky
          .get(`https://${config.network.api.akEndfield.base.zonai}` + path, {
            ...overrideDefSetKy,
            headers: { ...overrideDefSetKy.headers, cred, ...calcSignHeader(path, cred, token) },
          })
          .json();
        return rsp as TypesApiAkEndfield.ZonaiWebV2User;
      },
    },
  },
  api: {
    v1: {
      game: {
        player: {
          binding: async (cred: string, token: string) => {
            const path = '/api/v1/game/player/binding';
            const rsp = await ky
              .get(`https://${config.network.api.akEndfield.base.zonai}` + path, {
                ...overrideDefSetKy,
                headers: { ...overrideDefSetKy.headers, cred, ...calcSignHeader(path, cred, token) },
              })
              .json();
            return rsp as TypesApiAkEndfield.ZonaiApiV1GamePlayerBinding;
          },
        },
      },
    },
  },
};
