import deepmerge from 'deepmerge';
import YAML from 'yaml';
// import * as TypesGameEntry from '../types/GameEntry.js';
import * as TypesLogLevels from '../types/LogLevels.js';

type Freeze<T> = Readonly<{
  [P in keyof T]: T[P] extends object ? Freeze<T[P]> : T[P];
}>;
type AllRequired<T> = Required<{
  [P in keyof T]: T[P] extends object ? Freeze<T[P]> : T[P];
}>;

type ConfigType = AllRequired<
  Freeze<{
    network: {
      api: {
        akEndfield: {
          appCode: {
            game: { osWinRel: string };
            launcher: { osWinRel: string };
            accountService: { osWinRel: string };
            u8: { osWinRel: string };
          };
          channel: { osWinRel: number };
          base: {
            accountService: string;
            launcher: string;
            u8: string;
          };
        };
      };
      userAgent: {
        // UA to hide the fact that the access is from this tool
        minimum: string;
        chromeWindows: string;
        curl: string;
        ios: string;
      };
      timeout: number; // Network timeout
      retryCount: number; // Number of retries for access failure
    };
    threadCount: {
      // Upper limit on the number of threads for parallel processing
      network: number; // network access
    };
    cli: {
      autoExit: boolean; // Whether to exit the tool without waiting for key input when the exit code is 0
    };
    logger: {
      // log4js-node logger settings
      logLevel: TypesLogLevels.LogLevelNumber;
      useCustomLayout: boolean;
      customLayoutPattern: string;
    };
  }>
>;

const initialConfig: ConfigType = {
  network: {
    api: {
      akEndfield: {
        appCode: {
          game: { osWinRel: 'YDUTE5gscDZ229CW' },
          launcher: { osWinRel: 'TiaytKBUIEdoEwRT' },
          accountService: { osWinRel: 'd9f6dbb6bbd6bb33' },
          u8: { osWinRel: '973bd727dd11cbb6ead8' },
        },
        channel: { osWinRel: 6 },
        base: {
          accountService: 'YXMuZ3J5cGhsaW5lLmNvbQ==',
          launcher: 'bGF1bmNoZXIuZ3J5cGhsaW5lLmNvbS9hcGk=',
          u8: 'dTguZ3J5cGhsaW5lLmNvbQ==',
        },
      },
    },
    userAgent: {
      minimum: 'Mozilla/5.0',
      chromeWindows:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      curl: 'curl/8.4.0',
      ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    },
    timeout: 20000,
    retryCount: 5,
  },
  threadCount: { network: 16 },
  cli: { autoExit: false },
  logger: {
    logLevel: 0,
    useCustomLayout: true,
    customLayoutPattern: '%[%d{hh:mm:ss.SSS} %-5.0p >%] %m',
  },
};

const deobfuscator = (input: ConfigType): ConfigType => {
  const newConfig = JSON.parse(JSON.stringify(input)) as any;
  const api = newConfig.network.api.akEndfield;
  for (const key of Object.keys(api.base) as (keyof typeof api.base)[]) {
    api.base[key] = atob(api.base[key]);
  }
  return newConfig as ConfigType;
};

const filePath = 'config/config.yaml';

if ((await Bun.file(filePath).exists()) === false) {
  await Bun.write(filePath, YAML.stringify(initialConfig));
}

const config: ConfigType = await (async () => {
  const rawFileData: ConfigType = YAML.parse(await Bun.file(filePath).text()) as ConfigType;
  const mergedConfig = deepmerge(initialConfig, rawFileData, {
    arrayMerge: (_destinationArray, sourceArray) => sourceArray,
  });
  if (JSON.stringify(rawFileData) !== JSON.stringify(mergedConfig)) {
    await Bun.write(filePath, YAML.stringify(mergedConfig));
  }
  return deobfuscator(mergedConfig);
})();

export default config;
