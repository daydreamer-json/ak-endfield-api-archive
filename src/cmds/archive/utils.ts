import path from 'node:path';
import ky, { HTTPError } from 'ky';
import { DateTime } from 'luxon';
import argvUtils from '../../utils/argv.js';
import appConfig from '../../utils/config.js';
import logger from '../../utils/logger.js';
import type { StoredData } from './types.js';

export function getObjectDiff(
  obj1: any,
  obj2: any,
  ignoreRules: { path: string[]; pattern: RegExp }[] = [],
  currentPath: string[] = [],
) {
  const diff: any = {};
  const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

  for (const key of keys) {
    const val1 = obj1?.[key];
    const val2 = obj2?.[key];
    const fullPath = [...currentPath, key];
    if (JSON.stringify(val1) === JSON.stringify(val2)) continue;

    const rule = ignoreRules.find(
      (r) => r.path.length === fullPath.length && r.path.every((p, i) => p === '*' || p === fullPath[i]),
    );

    if (rule && typeof val1 === 'string' && typeof val2 === 'string') {
      const normalized1 = val1.replace(rule.pattern, '');
      const normalized2 = val2.replace(rule.pattern, '');
      if (normalized1 === normalized2) continue;
    }

    if (typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null) {
      const nestedDiff = getObjectDiff(val1, val2, ignoreRules, fullPath);
      if (Object.keys(nestedDiff).length > 0) diff[key] = nestedDiff;
    } else {
      diff[key] = { old: val1, new: val2 };
    }
  }
  return diff;
}

export async function saveResultWithHistory<T>(
  subPaths: string[],
  version: string | null,
  data: { req: any; rsp: T },
  options: {
    saveLatest?: boolean;
    ignoreRules?: { path: string[]; pattern: RegExp }[];
    allFileName?: string;
  } = {},
) {
  const { saveLatest = true, ignoreRules = [], allFileName = 'all.json' } = options;
  const outputDir = argvUtils.getArgv()['outputDir'];
  const filePathBase = path.join(outputDir, ...subPaths);
  const dataStr = JSON.stringify(data, null, 2);

  // 1. Save v{version}.json and latest.json if changed
  const filesToCheck: string[] = [];
  if (version) filesToCheck.push(path.join(filePathBase, `v${version}.json`));
  if (saveLatest) filesToCheck.push(path.join(filePathBase, 'latest.json'));

  for (const filePath of filesToCheck) {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      await Bun.write(filePath, dataStr);
    } else {
      const currentData = await file.json();
      const diff = getObjectDiff({ rsp: currentData.rsp }, { rsp: data.rsp }, ignoreRules);
      if (Object.keys(diff).length > 0) {
        logger.trace(`Diff detected in ${filePath}:`, JSON.stringify(diff, null, 2));
        await Bun.write(filePath, dataStr);
      }
    }
  }

  // 2. Update all.json history
  const allFilePath = path.join(filePathBase, allFileName);
  const allFile = Bun.file(allFilePath);
  let allData: StoredData<T>[] = (await allFile.exists()) ? await allFile.json() : [];

  const exists = allData.some((e) => {
    const diff = getObjectDiff({ rsp: e.rsp }, { rsp: data.rsp }, ignoreRules);
    return Object.keys(diff).length === 0;
  });

  if (!exists) {
    allData.push({ updatedAt: DateTime.now().toISO(), ...data });
    await Bun.write(allFilePath, JSON.stringify(allData, null, 2));
    return true; // was updated
  }
  return false;
}

export async function downloadRawFile(url: string) {
  const urlObj = new URL(url);
  urlObj.search = '';
  const localPath = path.join(
    argvUtils.getArgv()['outputDir'],
    'raw',
    urlObj.hostname,
    ...urlObj.pathname.split('/').filter(Boolean),
  );

  if (await Bun.file(localPath).exists()) return false;

  try {
    const data = await ky
      .get(url, {
        headers: { 'User-Agent': appConfig.network.userAgent.minimum },
        timeout: appConfig.network.timeout,
        retry: { limit: appConfig.network.retryCount },
      })
      .bytes();
    await Bun.write(localPath, data);
    return true;
  } catch (err) {
    if (err instanceof HTTPError && (err.response.status === 404 || err.response.status === 403)) return false;
    throw err;
  }
}
