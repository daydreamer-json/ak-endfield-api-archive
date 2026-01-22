const LOG_LEVELS = {
  0: 'trace',
  1: 'debug',
  2: 'info',
  3: 'warn',
  4: 'error',
  5: 'fatal',
} as const;
const LOG_LEVELS_NUM = [0, 1, 2, 3, 4, 5] as const;

type LogLevelNumber = keyof typeof LOG_LEVELS;
type LogLevelString = (typeof LOG_LEVELS)[LogLevelNumber];

export type { LogLevelNumber, LogLevelString };
export { LOG_LEVELS, LOG_LEVELS_NUM };
