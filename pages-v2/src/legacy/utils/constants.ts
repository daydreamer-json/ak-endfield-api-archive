export const BASE_URL =
  'https://raw.githubusercontent.com/daydreamer-json/ak-endfield-api-archive/refs/heads/main/output';

export const FILE_SIZE_OPTS = {
  decimals: 2,
  decimalPadding: true,
  useBinaryUnit: true,
  useBitUnit: false,
  unitVisible: true,
  unit: null,
};

export const gameTargets = [
  { name: 'Official', region: 'os' as const, dirName: '6', channel: 6 },
  { name: 'Epic', region: 'os' as const, dirName: '801', channel: 6 },
  { name: 'Google Play', region: 'os' as const, dirName: '802', channel: 6 },
  { name: 'Official', region: 'cn' as const, dirName: '1', channel: 1 },
  { name: 'Bilibili', region: 'cn' as const, dirName: '2', channel: 2 },
];

export const launcherTargets = [
  { id: 'os', apps: ['EndField', 'Official'], channel: 6 },
  { id: 'cn', apps: ['EndField', 'Arknights', 'Official'], channel: 1 },
];

export const launcherWebApiLang = {
  os: [
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
  cn: ['zh-cn'] as const,
};
