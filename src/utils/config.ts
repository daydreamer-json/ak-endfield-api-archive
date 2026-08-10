import deepmerge from 'deepmerge';
import YAML from 'yaml';
// import * as TypesGameEntry from '../types/GameEntry.js';
import * as TypesLogLevels from '../types/LogLevels.js';

type Freeze<T> = Readonly<{
  [P in keyof T]: T[P] extends object ? Freeze<T[P]> : T[P];
}>;

const initialConfig = {
  cipher: {
    akEndfield: {
      resIndexKey: 'Assets/Beyond/DynamicAssets/Gameplay/UI/Fonts/', // via reversing
      launcherAesKey: 'c0f30e1ce763bbc21cc355a34303ac50399444bff68c4a22af398c0a166ee143', // via reversing
      launcherAesIv: '33467861192750649501937264608400', // via reversing
    },
  },
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
        bulletin: {
          code: { os: 'endfield_U35PW8', cn: 'endfield_5SD9TN' },
          server: { os: 3, cn: null }, // CN always falls back to #DEFAULT
        },
        base: {
          accountService: 'YXMuZ3J5cGhsaW5lLmNvbQ==',
          gameHub: 'Z2FtZS1odWIuZ3J5cGhsaW5lLmNvbQ==',
          gameHubCN: 'Z2FtZS1odWIuaHlwZXJncnlwaC5jb20=',
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
    logLevel: 0 as TypesLogLevels.LogLevelNumber,
    useCustomLayout: true,
    customLayoutPattern: '%[%d{hh:mm:ss.SSS} %-5.0p >%] %m',
  },
};

type ConfigType = Freeze<typeof initialConfig>;

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
