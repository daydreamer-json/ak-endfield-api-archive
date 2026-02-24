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
            game: { osWinRel: string; cnWinRel: string };
            launcher: { osWinRel: string; osWinRelEpic: string; cnWinRel: string };
            accountService: { osWinRel: string; skport: string; binding: string };
            u8: { osWinRel: string };
          };
          channel: { osWinRel: number; cnWinRel: number; cnWinRelBilibili: number };
          subChannel: {
            osWinRel: number;
            osWinRelEpic: number;
            osWinRelGooglePlay: number;
            cnWinRel: number;
            cnWinRelBilibili: number;
          };
          base: {
            accountService: string;
            gameHub: string;
            launcher: string;
            launcherCN: string;
            u8: string;
            binding: string;
            webview: string;
            zonai: string;
          };
        };
      };
      userAgent: {
        // UA to hide the fact that the access is from this tool
        minimum: string;
        chromeWindows: string;
        qtHgSdk: string;
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
          game: { osWinRel: 'YDUTE5gscDZ229CW', cnWinRel: '6LL0KJuqHBVz33WK' },
          launcher: { osWinRel: 'TiaytKBUIEdoEwRT', osWinRelEpic: 'BBWoqCzuZ2bZ1Dro', cnWinRel: 'abYeZZ16BPluCFyT' },
          accountService: { osWinRel: 'd9f6dbb6bbd6bb33', skport: '6eb76d4e13aa36e6', binding: '3dacefa138426cfe' },
          u8: { osWinRel: '973bd727dd11cbb6ead8' },
        },
        channel: { osWinRel: 6, cnWinRel: 1, cnWinRelBilibili: 2 },
        subChannel: { osWinRel: 6, osWinRelEpic: 801, osWinRelGooglePlay: 802, cnWinRel: 1, cnWinRelBilibili: 2 },
        base: {
          accountService: 'YXMuZ3J5cGhsaW5lLmNvbQ==',
          gameHub: 'Z2FtZS1odWIuZ3J5cGhsaW5lLmNvbQ==',
          launcher: 'bGF1bmNoZXIuZ3J5cGhsaW5lLmNvbS9hcGk=',
          launcherCN: 'bGF1bmNoZXIuaHlwZXJncnlwaC5jb20vYXBp',
          u8: 'dTguZ3J5cGhsaW5lLmNvbQ==',
          binding: 'YmluZGluZy1hcGktYWNjb3VudC1wcm9kLmdyeXBobGluZS5jb20=',
          webview: 'ZWYtd2Vidmlldy5ncnlwaGxpbmUuY29t',
          zonai: 'em9uYWkuc2twb3J0LmNvbQ==',
        },
      },
    },
    userAgent: {
      minimum: 'Mozilla/5.0',
      chromeWindows:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      qtHgSdk:
        'Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) QtWebEngine/5.15.8 Chrome/87.0.4280.144 Safari/537.36 PC/WIN/HGSDK HGWebPC/1.30.1',
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
