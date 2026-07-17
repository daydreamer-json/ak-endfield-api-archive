import path from 'node:path';
import { DateTime } from 'luxon';
import PQueue from 'p-queue';
import semver from 'semver';
import type * as IResEndfield from '../../types/api/akEndfield/Res.js';
import apiUtils from '../../utils/api/index.js';
import argvUtils from '../../utils/argv.js';
import cipher from '../../utils/cipher.js';
import appConfig from '../../utils/config.js';
import logger from '../../utils/logger.js';
import mathUtils from '../../utils/math.js';
import stringUtils from '../../utils/string.js';
import { DIFF_IGNORE_RULES, getBulletinTargets, getGameTargets, getLauncherTargets } from './constants.js';
import type {
  AssetToMirror,
  AssetToMirrorRes,
  AssetToMirrorResPatch,
  GameTarget,
  LatestGameResourcesResponse,
  LatestGameResponse,
  LauncherTarget,
  MirrorFileEntry,
  MirrorFileResEntry,
  MirrorFileResPatchEntry,
  StoredData,
} from './types.js';
import { downloadRawFile, getObjectDiff, saveResultWithHistory } from './utils.js';

export class Archiver {
  private assetsToMirror: AssetToMirror[] = [];
  private networkQueue = new PQueue({ concurrency: appConfig.threadCount.network });
  private gameTargets: GameTarget[];
  private launcherTargets: LauncherTarget[];

  constructor() {
    this.gameTargets = getGameTargets();
    this.launcherTargets = getLauncherTargets();
  }

  public async run() {
    await this.fetchAndSaveLatestGames();
    await this.fetchAndSaveLatestGamePatches();
    await this.fetchAndSaveLatestGameResources();
    await this.fetchAndSaveLatestWebApis();
    await this.fetchAndSaveBulletins();
    await this.fetchAndSaveLauncherProtocol();
    await this.fetchAndSaveLatestLauncher();
    await this.fetchAndSaveAllGameResRawData();
    await this.addAllGameResVFSDataToPending();
    await this.processAssetsToMirror();
  }

  private async fetchAndSaveLatestGames() {
    logger.debug('Fetching latestGame ...');
    for (const target of this.gameTargets) {
      const rsp = await apiUtils.akEndfield.launcher.latestGame(
        target.appCode,
        target.launcherAppCode,
        target.channel,
        target.subChannel,
        target.launcherSubChannel,
        null,
        0,
        true,
        target.region,
      );
      logger.info(
        `Fetched latestGame: ${target.region.toUpperCase()}, ${target.name}, v${rsp.version}, ${this.formatBytes(
          parseInt(rsp.pkg.total_size) - mathUtils.arrayTotal(rsp.pkg.packs.map((e) => parseInt(e.package_size))),
        )}`,
      );

      const prettyRsp = {
        req: {
          appCode: target.appCode,
          launcherAppCode: target.launcherAppCode,
          channel: target.channel,
          subChannel: target.subChannel,
          launcherSubChannel: target.launcherSubChannel,
          diskType: 0,
          patchEncrypt: true,
        },
        rsp,
      };

      const subChns = appConfig.network.api.akEndfield.subChannel;
      if ([subChns.cnWinRel, subChns.cnWinRelBilibili, subChns.osWinRel].includes(target.subChannel)) {
        if (rsp.pkg.url) this.queueAssetForMirroring(rsp.pkg.url);
        rsp.pkg.packs.forEach((e) => this.queueAssetForMirroring(e.url));
      }

      await saveResultWithHistory(['akEndfield', 'launcher', 'game', target.dirName], rsp.version, prettyRsp, {
        ignoreRules: DIFF_IGNORE_RULES,
      });
    }
  }

  private async fetchAndSaveLatestGamePatches() {
    logger.debug('Fetching latestGamePatch ...');
    for (const target of this.gameTargets) {
      const outputDir = argvUtils.getArgv()['outputDir'];
      const gameAllPath = path.join(outputDir, 'akEndfield', 'launcher', 'game', target.dirName, 'all.json');
      if (!(await Bun.file(gameAllPath).exists())) continue;

      const gameAll = (await Bun.file(gameAllPath).json()) as StoredData<LatestGameResponse>[];
      const patchAllPath = path.join(outputDir, 'akEndfield', 'launcher', 'game', target.dirName, 'all_patch.json');
      let patchAll: StoredData<LatestGameResponse>[] = (await Bun.file(patchAllPath).exists())
        ? await Bun.file(patchAllPath).json()
        : [];

      const versionList = [...new Set(gameAll.map((e) => e.rsp.version))].sort((a, b) => semver.compare(b, a)).slice(1);
      let needWrite = false;

      for (const ver of versionList) {
        for (const paramDiskType of [0, 1] as const) {
          for (const paramPatchEnc of [true, false] as const) {
            this.networkQueue.add(async () => {
              const rsp = await apiUtils.akEndfield.launcher.latestGame(
                target.appCode,
                target.launcherAppCode,
                target.channel,
                target.subChannel,
                target.launcherSubChannel,
                ver,
                paramDiskType,
                paramPatchEnc,
                target.region,
              );
              if (!rsp.patch) return;

              const prettyRsp = {
                req: {
                  appCode: target.appCode,
                  launcherAppCode: target.launcherAppCode,
                  channel: target.channel,
                  subChannel: target.subChannel,
                  launcherSubChannel: target.launcherSubChannel,
                  diskType: paramDiskType,
                  patchEncrypt: paramPatchEnc,
                  version: ver,
                },
                rsp,
              };

              const exists = patchAll.some(
                (e) =>
                  Object.keys(getObjectDiff({ rsp: e.rsp }, { rsp: prettyRsp.rsp }, DIFF_IGNORE_RULES)).length === 0,
              );

              if (!exists) {
                logger.debug(
                  `Fetched latestGamePatch: ${target.region.toUpperCase()}, ${target.name}, v${2 - paramDiskType} fmt, v${rsp.request_version} -> v${
                    rsp.version
                  }, ${this.formatBytes(parseInt(rsp.patch.total_size) - parseInt(rsp.patch.package_size))}`,
                );
                patchAll.push({ updatedAt: DateTime.now().toISO(), ...prettyRsp });
                needWrite = true;

                const subChns = appConfig.network.api.akEndfield.subChannel;
                if (
                  [subChns.cnWinRel, subChns.cnWinRelBilibili, subChns.osWinRel].includes(target.subChannel) &&
                  paramDiskType === 0
                ) {
                  rsp.patch.patches.forEach((e) =>
                    this.queueAssetForMirroring(
                      e.url,
                      new URL(e.url).pathname
                        .split('/')
                        .filter(Boolean)
                        .slice(-5 + paramDiskType)
                        .join('_'),
                    ),
                  );
                }
              }
            });
          }
        }
      }

      await this.networkQueue.onIdle();

      if (needWrite) {
        await Bun.write(patchAllPath, JSON.stringify(patchAll, null, 2));
      }
    }

    // Download v2 patch info
    for (const target of this.gameTargets) {
      const outputDir = argvUtils.getArgv()['outputDir'];
      const patchAllPath = path.join(outputDir, 'akEndfield', 'launcher', 'game', target.dirName, 'all_patch.json');
      if (!(await Bun.file(patchAllPath).exists())) continue;
      const patchAll: StoredData<LatestGameResponse>[] = await Bun.file(patchAllPath).json();
      for (const e of patchAll) {
        if (e.rsp.patch?.v2_patch_info_url) {
          await downloadRawFile(e.rsp.patch.v2_patch_info_url);
        }
      }
    }
  }

  private async fetchAndSaveLatestGameResources() {
    logger.debug('Fetching latestGameRes ...');
    const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;

    const filteredTargets = this.gameTargets.filter(
      (t) => t.channel !== appConfig.network.api.akEndfield.channel.cnWinRelBilibili,
    );
    const uniqueTargets = Array.from(
      new Set(filteredTargets.map((t) => JSON.stringify({ region: t.region, appCode: t.appCode, channel: t.channel }))),
    ).map((s) => JSON.parse(s));

    for (const target of uniqueTargets) {
      const outputDir = argvUtils.getArgv()['outputDir'];
      const gameAllPath = path.join(outputDir, 'akEndfield', 'launcher', 'game', String(target.channel), 'all.json');
      if (!(await Bun.file(gameAllPath).exists())) continue;

      const versionInfos = ((await Bun.file(gameAllPath).json()) as StoredData<LatestGameResponse>[])
        .map((e) => e.rsp)
        .map((r) => ({
          version: r.version,
          versionMinor: `${semver.major(r.version)}.${semver.minor(r.version)}`,
          randStr: /_([^/]+)\/.+?$/.exec(r.pkg.file_path)?.[1] || '',
        }))
        .sort((a, b) => semver.compare(b.version, a.version));

      for (const platform of platforms) {
        let isLatestWrote = false;
        for (const vInfo of versionInfos) {
          if (!vInfo.randStr) throw new Error('version rand_str not found');
          const rsp = await apiUtils.akEndfield.launcher.latestGameResources(
            target.appCode,
            vInfo.versionMinor,
            vInfo.version,
            vInfo.randStr,
            platform,
            target.region,
          );
          logger.info(
            `Fetched latestGameRes: ${target.region.toUpperCase()}, ${platform}, v${vInfo.version}, ${rsp.res_version}`,
          );

          const prettyRsp = {
            req: {
              appCode: target.appCode,
              gameVersion: vInfo.versionMinor,
              version: vInfo.version,
              randStr: vInfo.randStr,
              platform,
            },
            rsp,
          };

          await saveResultWithHistory(
            ['akEndfield', 'launcher', 'game_resources', String(target.channel), platform],
            vInfo.version,
            prettyRsp,
            {
              saveLatest: !isLatestWrote,
            },
          );
          isLatestWrote = true;
        }
      }
    }
  }

  private async fetchAndSaveAllGameResRawData() {
    logger.debug('Fetching raw game resources ...');
    const wroteFiles: string[] = [];
    const outputDir = argvUtils.getArgv()['outputDir'];

    const addToQueue = (url: string) => {
      this.networkQueue.add(async () => {
        if (await downloadRawFile(url)) {
          wroteFiles.push(url);
        }
      });
    };

    // 1. Gather URLs from game resources
    const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;
    const filteredTargets = this.gameTargets.filter(
      (t) => t.channel !== appConfig.network.api.akEndfield.channel.cnWinRelBilibili,
    );
    const uniqueTargets = Array.from(
      new Set(filteredTargets.map((t) => JSON.stringify({ region: t.region, appCode: t.appCode, channel: t.channel }))),
    ).map((s) => JSON.parse(s));

    const resourceUrls = new Set<string>();
    for (const target of uniqueTargets) {
      for (const platform of platforms) {
        const resAllPath = path.join(
          outputDir,
          'akEndfield',
          'launcher',
          'game_resources',
          String(target.channel),
          platform,
          'all.json',
        );
        const file = Bun.file(resAllPath);
        if (!(await file.exists())) continue;

        const resAll = (await file.json()) as StoredData<LatestGameResourcesResponse>[];
        for (const entry of resAll) {
          for (const res of entry.rsp.resources) {
            const fileNames = res.name.includes('main')
              ? ['index_main.json', 'patch.json']
              : res.name.includes('initial')
                ? ['index_initial.json', 'patch.json']
                : ['index_main.json', 'index_initial.json', 'patch.json'];

            for (const fName of fileNames) {
              resourceUrls.add(`${res.path}/${fName}`);
            }
          }
        }
      }
    }
    for (const url of resourceUrls) addToQueue(url);

    // 2. Gather URLs from web APIs
    const webAssetUrls = new Set<string>();
    const webLangs = apiUtils.akEndfield.defaultSettings.launcherWebLang;
    const webConfigs = [
      { dir: 'banner', getUrls: (rsp: any) => rsp.banners?.map((b: any) => b.url) },
      { dir: 'main_bg_image', getUrls: (rsp: any) => [rsp.main_bg_image?.url, rsp.main_bg_image?.video_url] },
      { dir: 'sidebar', getUrls: (rsp: any) => rsp.sidebars?.map((s: any) => s.pic?.url) },
      { dir: 'single_ent', getUrls: (rsp: any) => [rsp.single_ent?.version_url] },
    ];

    for (const target of this.gameTargets) {
      for (const lang of webLangs) {
        for (const config of webConfigs) {
          const allPath = path.join(
            outputDir,
            'akEndfield',
            'launcher',
            'web',
            String(target.subChannel),
            config.dir,
            lang,
            'all.json',
          );
          const file = Bun.file(allPath);
          if (!(await file.exists())) continue;

          const data = (await file.json()) as StoredData<any>[];
          for (const entry of data) {
            if (!entry.rsp) continue;
            const urls = config.getUrls(entry.rsp);
            for (const url of urls) if (url) webAssetUrls.add(url);
          }
        }
      }
    }
    for (const url of webAssetUrls) addToQueue(url);

    // 3. Gather URLs from bulletins (images embedded in list[].data.html <img>, and picture data.url)
    const bulletinAssetUrls = new Set<string>();
    for (const target of getBulletinTargets()) {
      const serverSeg = target.server === null ? 'DEFAULT' : String(target.server);
      for (const typeName of ['game', 'gate'] as const) {
        for (const lang of target.langs) {
          const allPath = path.join(
            outputDir,
            'akEndfield',
            'gameHub',
            'bulletin',
            String(target.channel),
            serverSeg,
            typeName,
            lang,
            'all.json',
          );
          const file = Bun.file(allPath);
          if (!(await file.exists())) continue;

          const data = (await file.json()) as StoredData<any>[];
          for (const entry of data) {
            if (!entry.rsp?.data?.list) continue;
            for (const item of entry.rsp.data.list) {
              const itemData = item?.data;
              if (typeof itemData?.html === 'string') {
                for (const m of itemData.html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
                  bulletinAssetUrls.add(m[1]);
                }
              }
              if (typeof itemData?.url === 'string') bulletinAssetUrls.add(itemData.url);
            }
          }
        }
      }
    }
    for (const url of bulletinAssetUrls) {
      if (/\.(png|jpe?g|webp|gif|mp4)(\?|$)/i.test(url)) addToQueue(url);
    }

    await this.networkQueue.onIdle();

    // res index decryption
    for (const url of resourceUrls) {
      const urlObj = new URL(url);
      urlObj.search = '';
      if (!['index_initial.json', 'index_main.json'].includes(urlObj.pathname.split('/').pop()!)) continue;
      const localPath = path.join(outputDir, 'raw', urlObj.hostname, ...urlObj.pathname.split('/').filter(Boolean));
      const localPathDec = localPath.replace(/\.json$/, '_dec.json');
      if (!(await Bun.file(localPathDec).exists()) && (await Bun.file(localPath).exists())) {
        const encBytes = new Uint8Array(Buffer.from(await Bun.file(localPath).text(), 'base64'));
        const decBytes = cipher.decryptResIndex(encBytes, appConfig.cipher.akEndfield.resIndexKey);
        await Bun.write(localPathDec, decBytes);
      }
    }

    logger.info(`Fetched raw game resources: ${wroteFiles.length} files`);
  }

  private async fetchAndSaveLatestLauncher() {
    logger.debug('Fetching latestLauncher ...');
    for (const { id, apps, code, channel } of this.launcherTargets) {
      for (const app of apps) {
        const apiArgs = [code, channel, channel, null] as const;
        const [rsp, rspExe] = await Promise.all([
          apiUtils.akEndfield.launcher.latestLauncher(...apiArgs, app, id),
          apiUtils.akEndfield.launcher.latestLauncherExe(...apiArgs, app.toLowerCase(), id),
        ]);

        logger.info(`Fetched latestLauncher: ${id.toUpperCase()}, v${rsp.version}, ${app}`);
        const channelStr = String(channel);
        this.queueAssetForMirroring(rsp.zip_package_url);
        this.queueAssetForMirroring(rspExe.exe_url);

        await saveResultWithHistory(
          ['akEndfield', 'launcher', 'launcher', app, channelStr],
          rsp.version,
          {
            req: { appCode: code, channel, subChannel: channel, targetApp: app },
            rsp,
          },
          { ignoreRules: DIFF_IGNORE_RULES },
        );

        await saveResultWithHistory(
          ['akEndfield', 'launcher', 'launcherExe', app, channelStr],
          rspExe.version,
          {
            req: { appCode: code, channel, subChannel: channel, ta: app.toLowerCase() },
            rsp: rspExe,
          },
          { ignoreRules: DIFF_IGNORE_RULES },
        );
      }
    }
  }

  private async fetchAndSaveLatestWebApis() {
    logger.debug('Fetching latestWebApis ...');
    const langs = apiUtils.akEndfield.defaultSettings.launcherWebLang;
    const langsCN = apiUtils.akEndfield.defaultSettings.launcherWebLangCN;
    const apis = [
      { name: 'sidebar', method: apiUtils.akEndfield.launcherWeb.sidebar, dir: 'sidebar' },
      { name: 'singleEnt', method: apiUtils.akEndfield.launcherWeb.singleEnt, dir: 'single_ent' },
      { name: 'mainBgImage', method: apiUtils.akEndfield.launcherWeb.mainBgImage, dir: 'main_bg_image' },
      { name: 'banner', method: apiUtils.akEndfield.launcherWeb.banner, dir: 'banner' },
      { name: 'announcement', method: apiUtils.akEndfield.launcherWeb.announcement, dir: 'announcement' },
      { name: 'urlConfig', method: apiUtils.akEndfield.launcherWeb.urlConfig, dir: 'url_config' },
    ] as const;

    for (const target of this.gameTargets) {
      for (const lang of target.region === 'cn' ? langsCN : langs) {
        for (const api of apis) {
          this.networkQueue.add(async () => {
            const rsp = await api.method(target.appCode, target.channel, target.subChannel, lang, target.region);
            if (!rsp) return;
            const prettyRsp = {
              req: {
                appCode: target.appCode,
                channel: target.channel,
                subChannel: target.subChannel,
                lang,
                region: target.region,
                platform: 'Windows',
              },
              rsp,
            };
            await saveResultWithHistory(
              ['akEndfield', 'launcher', 'web', String(target.subChannel), api.dir, lang],
              null,
              prettyRsp,
              { ignoreRules: DIFF_IGNORE_RULES },
            );
          });
        }
      }
    }
    await this.networkQueue.onIdle();
  }

  private async fetchAndSaveBulletins() {
    logger.debug('Fetching bulletins ...');
    for (const target of getBulletinTargets()) {
      const serverSeg = target.server === null ? 'DEFAULT' : String(target.server);
      for (const lang of target.langs) {
        for (const type of [0, 1] as const) {
          this.networkQueue.add(async () => {
            const rsp = await apiUtils.akEndfield.gameHub.bulletin.aggregate(
              target.channel,
              type,
              lang,
              target.region,
              target.server,
            );
            if (rsp.code !== 0) {
              logger.trace(
                `Bulletin non-zero code (${rsp.code}): ${target.region.toUpperCase()}, ch${target.channel}, ${lang}, type${type}`,
              );
              return;
            }
            const typeName = type === 0 ? 'game' : 'gate';
            const prettyRsp = {
              req: {
                channel: target.channel,
                server: target.server,
                type,
                lang,
                region: target.region,
                platform: 'Windows',
              },
              rsp,
            };
            await saveResultWithHistory(
              ['akEndfield', 'gameHub', 'bulletin', String(target.channel), serverSeg, typeName, lang],
              null,
              prettyRsp,
              { ignoreRules: DIFF_IGNORE_RULES },
            );
          });
        }
      }
    }
    await this.networkQueue.onIdle();
  }

  private async fetchAndSaveLauncherProtocol() {
    logger.debug('Fetching launcherProtocol ...');
    const langs = apiUtils.akEndfield.defaultSettings.launcherWebLang;
    const langsCN = apiUtils.akEndfield.defaultSettings.launcherWebLangCN;
    const filterChannel = [
      appConfig.network.api.akEndfield.subChannel.cnWinRel,
      appConfig.network.api.akEndfield.subChannel.osWinRel,
      appConfig.network.api.akEndfield.subChannel.osWinRelEpic,
    ];
    for (const target of this.gameTargets.filter((e) => filterChannel.includes(e.launcherSubChannel))) {
      for (const lang of target.region === 'cn' ? langsCN : langs) {
        this.networkQueue.add(async () => {
          const rsp = await apiUtils.akEndfield.launcher.protocol(
            target.launcherAppCode,
            target.channel,
            target.subChannel,
            lang,
            target.region,
            '',
          );
          if (!rsp) return;
          logger.trace(`Found protocol: ${rsp.dataVersion}, ${target.region.toUpperCase()}, ${target.name}, ${lang}`);
          const prettyRsp = {
            req: {
              appCode: target.launcherAppCode,
              channel: target.channel,
              subChannel: target.subChannel,
              language: lang,
              dataVersion: '',
            },
            rsp,
          };
          await saveResultWithHistory(
            ['akEndfield', 'launcher', 'protocol', String(target.subChannel), lang],
            null,
            prettyRsp,
            { ignoreRules: DIFF_IGNORE_RULES },
          );
        });
      }
    }
    await this.networkQueue.onIdle();
  }

  private async addAllGameResVFSDataToPending() {
    const outputDir = argvUtils.getArgv()['outputDir'];
    const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'] as const;
    const filteredTargets = this.gameTargets.filter(
      (t) => t.channel !== appConfig.network.api.akEndfield.channel.cnWinRelBilibili,
    );
    const uniqueTargets = [...new Set(filteredTargets.map((t) => t.channel))];

    const dbPath = path.join(outputDir, 'mirror_file_res_list.json.zst');
    const patchDbPath = path.join(outputDir, 'mirror_file_res_patch_list.json.zst');
    const pendingDbPath = path.join(outputDir, 'mirror_file_res_list_pending.json');
    const pendingPatchDbPath = path.join(outputDir, 'mirror_file_res_patch_list_pending.json');

    if (!(await Bun.file(dbPath).exists())) await Bun.write(dbPath, Bun.zstdCompressSync('[]'));
    if (!(await Bun.file(patchDbPath).exists())) await Bun.write(patchDbPath, Bun.zstdCompressSync('[]'));
    if (!(await Bun.file(pendingDbPath).exists())) await Bun.write(pendingDbPath, '[]');
    if (!(await Bun.file(pendingPatchDbPath).exists())) await Bun.write(pendingPatchDbPath, '[]');

    const db: MirrorFileResEntry[] = JSON.parse(
      Bun.zstdDecompressSync(await Bun.file(dbPath).bytes()).toString('utf-8'),
    );
    const patchDb: MirrorFileResPatchEntry[] = JSON.parse(
      Bun.zstdDecompressSync(await Bun.file(patchDbPath).bytes()).toString('utf-8'),
    );
    const pendingDb: AssetToMirrorRes[] = await Bun.file(pendingDbPath).json();
    const pendingPatchDb: AssetToMirrorResPatch[] = await Bun.file(pendingPatchDbPath).json();

    for (const channel of uniqueTargets) {
      for (const platform of platforms) {
        const apiResAllPath = path.join(
          outputDir,
          'akEndfield',
          'launcher',
          'game_resources',
          String(channel),
          platform,
          'all.json',
        );
        if (!(await Bun.file(apiResAllPath).exists())) continue;
        const apiResAll = ((await Bun.file(apiResAllPath).json()) as StoredData<LatestGameResourcesResponse>[])
          .map((e) => e.rsp.resources)
          .flat();
        for (const apiResEntry of apiResAll) {
          const indexJsonPath = path.join(
            outputDir,
            'raw',
            apiResEntry.path.replace('https://', ''),
            'index_' + apiResEntry.name + '_dec.json',
          );
          if (!(await Bun.file(indexJsonPath).exists())) continue;
          const indexJson: IResEndfield.ResourceIndex = await Bun.file(indexJsonPath).json();
          for (const resFile of indexJson.files) {
            if (db.some((e) => e.md5 === resFile.md5)) continue;
            if (pendingDb.some((e) => e.md5 === resFile.md5)) continue;
            pendingDb.push({
              md5: resFile.md5,
              name: `VFS_${apiResEntry.version}_${resFile.md5}.${path.extname(resFile.name).slice(1)}`,
              size: resFile.size,
              url: `${apiResEntry.path}/${resFile.name}`,
            });
          }

          const patchJsonPath = path.join(outputDir, 'raw', apiResEntry.path.replace('https://', ''), 'patch.json');
          if (!(await Bun.file(patchJsonPath).exists())) continue;
          const patchJson: IResEndfield.ResourcePatch = await Bun.file(patchJsonPath).json();
          for (const file of patchJson.files) {
            const md5New = file.md5;
            for (const patch of file.patch.toReversed()) {
              const md5Old = patch.base_md5;
              const size = patch.patch_size;
              const url = `${apiResEntry.path}/Patch/${patch.patch}`;
              if (patchDb.some((e) => e.md5Old === md5Old && e.md5New === md5New)) continue;
              if (pendingPatchDb.some((e) => e.md5Old === md5Old && e.md5New === md5New)) continue;
              pendingPatchDb.push({ md5Old, md5New, size, url });
            }
          }
        }
      }
    }

    await Bun.write(pendingDbPath, JSON.stringify(pendingDb, null, 2));
    await Bun.write(pendingPatchDbPath, JSON.stringify(pendingPatchDb, null, 2));
  }

  private async processAssetsToMirror() {
    const outputDir = argvUtils.getArgv()['outputDir'];
    const pendingPath = path.join(outputDir, 'mirror_file_list_pending.json');
    const dbPath = path.join(outputDir, 'mirror_file_list.json');

    let pendingData: AssetToMirror[] = (await Bun.file(pendingPath).exists()) ? await Bun.file(pendingPath).json() : [];
    const db: MirrorFileEntry[] = (await Bun.file(dbPath).exists()) ? await Bun.file(dbPath).json() : [];
    let addedCount = 0;

    const uniqueAssetsToMirror = this.assetsToMirror.filter(
      (asset, index, self) => index === self.findIndex((t) => t.url === asset.url),
    );

    for (const asset of uniqueAssetsToMirror) {
      const origUrl = stringUtils.removeQueryStr(asset.url);
      const dbExists = db.some((e) => e.orig.includes(origUrl));
      const pendingExists = pendingData.some((e) => stringUtils.removeQueryStr(e.url) === origUrl);
      if (!dbExists && !pendingExists) {
        pendingData.push(asset);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      logger.info(`Saved ${addedCount} new assets to mirror pending list`);
      await Bun.write(pendingPath, JSON.stringify(pendingData, null, 2));
    }
  }

  private queueAssetForMirroring(url: string, name: string | null = null) {
    this.assetsToMirror.push({ url, name });
  }

  private formatBytes(size: number) {
    return mathUtils.formatFileSize(size, {
      decimals: 2,
      decimalPadding: true,
      unitVisible: true,
      useBinaryUnit: true,
      useBitUnit: false,
      unit: null,
    });
  }
}
