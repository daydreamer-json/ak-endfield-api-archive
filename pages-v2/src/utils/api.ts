import ky from 'ky';
import { BASE_URL, gameTargets, launcherTargets, launcherWebApiLang } from './constants';

const apiCache = new Map<string, Promise<any>>();

export function fetchJson<T>(url: string): Promise<T> {
  if (!apiCache.has(url)) {
    const promise = ky
      .get(url)
      .json<T>()
      .catch((err) => {
        apiCache.delete(url);
        throw err;
      });
    apiCache.set(url, promise);
  }
  return apiCache.get(url) as Promise<T>;
}

export async function preloadData() {
  const promises: Promise<any>[] = [];
  promises.push(fetchJson(`${BASE_URL}/mirror_file_list.json`));
  const launcherWebApiFolderNames = ['announcement', 'banner', 'main_bg_image', 'sidebar', 'single_ent'];
  for (const target of gameTargets) {
    promises.push(fetchJson(`${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all.json`));
    promises.push(fetchJson(`${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all_patch.json`));
    for (const apiName of launcherWebApiFolderNames) {
      for (const lang of launcherWebApiLang[target.region]) {
        promises.push(fetchJson(`${BASE_URL}/akEndfield/launcher/web/${target.dirName}/${apiName}/${lang}/all.json`));
      }
    }
  }
  const resTargets = [
    { region: 'os', channel: 6 },
    { region: 'cn', channel: 1 },
  ];
  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'];
  for (const target of resTargets) {
    for (const platform of platforms) {
      promises.push(fetchJson(`${BASE_URL}/akEndfield/launcher/game_resources/${target.channel}/${platform}/all.json`));
    }
  }
  for (const region of launcherTargets) {
    for (const app of region.apps) {
      promises.push(fetchJson(`${BASE_URL}/akEndfield/launcher/launcher/${app}/${region.channel}/all.json`));
      promises.push(fetchJson(`${BASE_URL}/akEndfield/launcher/launcherExe/${app}/${region.channel}/all.json`));
    }
  }

  await Promise.all(promises);
}
