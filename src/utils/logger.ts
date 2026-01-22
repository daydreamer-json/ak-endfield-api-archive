import log4js from 'log4js';
import * as TypesLogLevels from '../types/LogLevels.js';
import appConfig from './config.js';

log4js.configure({
  appenders: {
    System: {
      type: 'stdout',
      layout: {
        type: appConfig.logger.useCustomLayout ? 'pattern' : 'colored',
        pattern: appConfig.logger.useCustomLayout ? appConfig.logger.customLayoutPattern : '',
      },
    },
  },
  categories: {
    default: {
      appenders: ['System'],
      level: TypesLogLevels.LOG_LEVELS[appConfig.logger.logLevel],
    },
  },
});

const logger: log4js.Logger = log4js.getLogger('System');

export default logger;
