import appConfig from '../../config.js';

const defaultSettings = {
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
  launcherWebLangCN: ['zh-cn'] as const,
};

export type LauncherWebLang = (typeof defaultSettings.launcherWebLang)[number];

export default defaultSettings;
