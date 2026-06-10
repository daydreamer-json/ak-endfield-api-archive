import type apiUtils from '../../utils/api/index.js';

export type LatestGameResponse = Awaited<ReturnType<typeof apiUtils.akEndfield.launcher.latestGame>>;
export type LatestGameResourcesResponse = Awaited<ReturnType<typeof apiUtils.akEndfield.launcher.latestGameResources>>;

export interface StoredData<T> {
  req: any;
  rsp: T;
  updatedAt: string;
}

export interface MirrorFileEntry {
  orig: string;
  mirror: string;
  origStatus: boolean;
}

export interface MirrorFileResEntry {
  md5: string;
  mirror: string;
  chunk: { start: number; length: number } | null;
}

export interface MirrorFileResPatchEntry {
  md5Old: string;
  md5New: string;
  mirror: string;
  chunk: { start: number; length: number } | null;
}

export interface GameTarget {
  name: string;
  region: 'os' | 'cn';
  appCode: string;
  launcherAppCode: string;
  channel: number;
  subChannel: number;
  launcherSubChannel: number;
  dirName: string;
}

export interface LauncherTarget {
  id: 'os' | 'cn';
  apps: ('EndField' | 'Arknights' | 'Official')[];
  code: string;
  channel: number;
}

export interface AssetToMirror {
  url: string;
  name: string | null;
}
export interface AssetToMirrorRes {
  md5: string;
  name: string;
  size: number;
  url: string;
}

export interface AssetToMirrorResPatch {
  md5Old: string;
  md5New: string;
  size: number;
  url: string;
}
