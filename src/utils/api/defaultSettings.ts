import appConfig from '../config.js';

export default {
  ky: {
    headers: {
      'User-Agent': appConfig.network.userAgent.minimum,
    },
    timeout: appConfig.network.timeout,
    retry: { limit: appConfig.network.retryCount },
  },
  launcherWebLang: [
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
  ] as const,
};
