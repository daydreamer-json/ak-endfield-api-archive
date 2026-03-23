import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import type { MirrorFileEntry, StoredData } from '../../types';
import { fetchJson } from '../../utils/api';
import { BASE_URL, FILE_SIZE_OPTS, gameTargets, launcherTargets } from '../../utils/constants';
import math from '../../utils/math';

interface Props {
  mirrorFileDb: MirrorFileEntry[];
}

interface GameVersionData {
  version: string;
  date: string;
}

interface OverviewTableData {
  region: string;
  channelName: string;
  version: string;
  packedSize: string;
  unpackedSize: string;
}

interface ResourceVersionData {
  platform: string;
  version: string;
  date: string;
}

export default function OverviewTab({ mirrorFileDb }: Props) {
  const [globalPkg, setGlobalPkg] = useState<GameVersionData | null>(null);
  const [chinaPkg, setChinaPkg] = useState<GameVersionData | null>(null);
  const [tableData, setTableData] = useState<OverviewTableData[]>([]);
  const [resourceData, setResourceData] = useState<ResourceVersionData[]>([]);
  const [mirrorStats, setMirrorStats] = useState<string>('---');

  useEffect(() => {
    // 1. Latest Version Info
    const fetchLatestVersion = async (url: string) => {
      try {
        const dat = await fetchJson<StoredData<any>[]>(url);
        const latest = dat.at(-1);
        if (!latest) return { version: '---', date: '---' };
        return {
          version: latest.rsp.version,
          date: DateTime.fromISO(latest.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss'),
        };
      } catch {
        return { version: '---', date: '---' };
      }
    };

    fetchLatestVersion(`${BASE_URL}/akEndfield/launcher/game/6/all.json`).then(setGlobalPkg);
    fetchLatestVersion(`${BASE_URL}/akEndfield/launcher/game/1/all.json`).then(setChinaPkg);

    // 2. Game Packages Table & Mirror Stats Calculation
    const calculateStatsAndTable = async () => {
      const mirrorOrigSet = new Set<string>();
      for (const m of mirrorFileDb) {
        try {
          const u = new URL(m.orig);
          u.search = '';
          mirrorOrigSet.add(u.toString());
        } catch {}
      }

      const countedUrls = new Set<string>();
      let totalMirrorSize = 0;

      const checkAndAddSize = (url: string, size: number) => {
        if (!url || isNaN(size)) return;
        try {
          const u = new URL(url);
          u.search = '';
          const cleanUrl = u.toString();
          if (countedUrls.has(cleanUrl)) return;
          if (mirrorOrigSet.has(cleanUrl)) {
            totalMirrorSize += size;
            countedUrls.add(cleanUrl);
          }
        } catch {}
      };

      const newTableData: OverviewTableData[] = [];

      // Game Packages
      for (const target of gameTargets) {
        const url = `${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all.json`;
        try {
          const data = await fetchJson<StoredData<any>[]>(url);
          if (!data || data.length === 0) continue;

          const latest = data[data.length - 1];
          if (!latest) continue;

          const version = latest.rsp.version;
          const packedSize = math.arrayTotal(latest.rsp.pkg.packs.map((f: any) => parseInt(f.package_size)));
          const totalSize = parseInt(latest.rsp.pkg.total_size);
          const unpackedSize = totalSize - packedSize;

          newTableData.push({
            region: target.region === 'cn' ? 'China' : 'Global',
            channelName: target.name,
            version: version,
            packedSize: math.formatFileSize(packedSize, FILE_SIZE_OPTS),
            unpackedSize: math.formatFileSize(unpackedSize, FILE_SIZE_OPTS),
          });

          for (const entry of data) {
            if (entry.rsp.pkg && entry.rsp.pkg.packs) {
              for (const pack of entry.rsp.pkg.packs) {
                checkAndAddSize(pack.url, parseInt(pack.package_size));
              }
            }
          }
        } catch (e) {
          console.warn('Overview: Failed to fetch game data', target.name, e);
        }
      }
      setTableData(newTableData);

      // Patches (only for stats)
      for (const target of gameTargets) {
        const url = `${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all_patch.json`;
        try {
          const data = await fetchJson<StoredData<any>[]>(url);
          for (const entry of data) {
            if (!entry.rsp.patch) continue;
            if (entry.rsp.patch.url) {
              checkAndAddSize(entry.rsp.patch.url, parseInt(entry.rsp.patch.package_size));
            }
            if (entry.rsp.patch.patches) {
              for (const p of entry.rsp.patch.patches) {
                checkAndAddSize(p.url, parseInt(p.package_size));
              }
            }
          }
        } catch {}
      }

      // Launchers (only for stats)
      for (const region of launcherTargets) {
        for (const app of region.apps) {
          try {
            const urlZip = `${BASE_URL}/akEndfield/launcher/launcher/${app}/${region.channel}/all.json`;
            const dataZip = await fetchJson<StoredData<any>[]>(urlZip);
            for (const e of dataZip) {
              checkAndAddSize(e.rsp.zip_package_url, parseInt(e.rsp.package_size));
            }
          } catch {}
          try {
            const urlExe = `${BASE_URL}/akEndfield/launcher/launcherExe/${app}/${region.channel}/all.json`;
            const dataExe = await fetchJson<StoredData<any>[]>(urlExe);
            for (const e of dataExe) {
              checkAndAddSize(e.rsp.exe_url, parseInt(e.rsp.exe_size));
            }
          } catch {}
        }
      }

      setMirrorStats(math.formatFileSize(totalMirrorSize, { ...FILE_SIZE_OPTS, unit: 'G' }));
    };

    calculateStatsAndTable();

    // 3. Latest Game Resources
    const fetchResources = async () => {
      const resPlatforms = ['Windows', 'Android', 'iOS', 'PlayStation'];
      const resData = await Promise.all(
        resPlatforms.map(async (p) => {
          try {
            const url = `${BASE_URL}/akEndfield/launcher/game_resources/6/${p}/all.json`;
            const dat = await fetchJson<StoredData<any>[]>(url);
            return dat.at(-1);
          } catch {
            return undefined;
          }
        }),
      );

      const newResourceData = resPlatforms.map((p, i) => {
        const item = resData[i];
        if (!item) {
          return { platform: p, version: '---', date: '' };
        }
        const initialRes = item.rsp.resources.find((e: any) => e.name === 'initial');
        const mainRes = item.rsp.resources.find((e: any) => e.name === 'main');
        let version = '---';
        if (initialRes && mainRes) {
          version = initialRes.version === mainRes.version ? mainRes.version : item.rsp.res_version;
        }
        return {
          platform: p,
          version: version,
          date: DateTime.fromISO(item.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss'),
        };
      });
      setResourceData(newResourceData);
    };
    fetchResources();
  }, [mirrorFileDb]);

  if (!globalPkg || !chinaPkg) {
    return (
      <div className='text-center'>
        <div className='spinner-border' role='status'></div>
        <p>Loading overview...</p>
      </div>
    );
  }

  return (
    <div>
      <div className='card mb-3'>
        <div className='card-body'>
          <h3 className='card-title mb-4'>Latest Game Packages</h3>
          <div className='row text-center mb-4'>
            <div className='col-md-6 mb-md-0 mb-3'>
              <p className='lh-1 mb-0'>
                <span className='fw-bold fs-1'>{globalPkg.version}</span>
                <br />
                <span className='small opacity-75' style={{ lineHeight: 1.5 }}>
                  {globalPkg.date}
                </span>
                <br />
                Latest Version (Global)
              </p>
            </div>
            <div className='col-md-6'>
              <p className='lh-1 mb-0'>
                <span className='fw-bold fs-1'>{chinaPkg.version}</span>
                <br />
                <span className='small opacity-75' style={{ lineHeight: 1.5 }}>
                  {chinaPkg.date}
                </span>
                <br />
                Latest Version (China)
              </p>
            </div>
          </div>

          <div className='table-responsive'>
            <table className='table table-striped table-bordered table-sm align-middle text-nowrap'>
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Channel</th>
                  <th>Version</th>
                  <th className='text-end'>Packed</th>
                  <th className='text-end'>Unpacked</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr key={i}>
                    <td>{row.region}</td>
                    <td>{row.channelName}</td>
                    <td>{row.version}</td>
                    <td className='text-end'>{row.packedSize}</td>
                    <td className='text-end'>{row.unpackedSize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className='card mb-3'>
        <div className='card-body'>
          <h3 className='card-title mb-4'>Latest Game Resources</h3>
          <div className='row text-center'>
            {resourceData.map((res, i) => (
              <div key={i} className='col-12 col-md-6 col-lg-3 mb-3 mb-lg-0'>
                <p className='lh-1 mb-0'>
                  <span className='fw-bold fs-1'>{res.version}</span>
                  <br />
                  {res.date && (
                    <>
                      <span className='small opacity-75' style={{ lineHeight: 1.5 }}>
                        {res.date}
                      </span>
                      <br />
                    </>
                  )}
                  {res.platform}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className='card'>
        <div className='card-body'>
          <h3 className='card-title'>Mirror Statistics</h3>
          <p className='card-text text-center lh-1'>
            <span className='fw-bold fs-1'>{mirrorStats}</span>
            <br />
            uploaded to mirror
          </p>
        </div>
      </div>
    </div>
  );
}
