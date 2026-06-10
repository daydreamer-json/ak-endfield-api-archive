import kyFactory from 'ky';
import * as TypesApiAkEndfield from '../../../types/api/akEndfield/Api.js';
import config from '../../config.js';

export default class GameHub {
  private customKy: typeof kyFactory;

  constructor(kyInstance: typeof kyFactory) {
    this.customKy = kyInstance.extend({
      headers: {
        'User-Agent': config.network.userAgent.qtHgSdk,
      },
    });
  }

  giftcode = {
    redeem: async (
      channelId: number,
      serverId: number,
      platform: 'Windows' | 'iOS' | 'Android',
      code: string,
      token: string,
      confirm: boolean = false,
    ) => {
      const rsp = await this.customKy
        .post(`https://${config.network.api.akEndfield.base.gameHub}/giftcode/api/redeem`, {
          headers: {
            Origin: 'https://' + config.network.api.akEndfield.base.webview,
            Referer:
              'https://' +
              config.network.api.akEndfield.base.webview +
              `/page/giftcode?u8_token=${encodeURIComponent(token)}&platform=${platform}&channel=${channelId}&subChannel=${channelId}&lang=en-us&server=${serverId}`,
            'Accept-Language': 'en-us',
          },
          json: { channelId: String(channelId), serverId: String(serverId), platform, code, token, confirm },
        })
        .json();
      return rsp as TypesApiAkEndfield.GameHubGiftCodeRedeem;
    },
  };
}
