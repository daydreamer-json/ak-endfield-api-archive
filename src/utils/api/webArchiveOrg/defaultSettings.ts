import appConfig from '../../config.js';

export default {
  ky: {
    headers: {
      'User-Agent': appConfig.network.userAgent.chromeWindows,
    },
    timeout: appConfig.network.timeout,
    retry: { limit: appConfig.network.retryCount },
  },
};
