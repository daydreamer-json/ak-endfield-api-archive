import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import type { MirrorFileEntry, StoredData } from '../../types';
import { fetchJson } from '../../utils/api';
import { BASE_URL, FILE_SIZE_OPTS, launcherTargets } from '../../utils/constants';
import math from '../../utils/math';
import { generateDownloadLinks } from '../../utils/ui';

interface Props {
  mirrorFileDb: MirrorFileEntry[];
}

interface LauncherData {
  regionId: string;
  app: string;
  zips: Array<{
    dateStr: string;
    version: string;
    fileName: string;
    md5: string;
    unpackedStr: string;
    packedStr: string;
    url: string;
  }>;
  exes: Array<{
    dateStr: string;
    version: string;
    fileName: string;
    sizeStr: string;
    url: string;
  }>;
}

export default function LauncherTab({ mirrorFileDb }: Props) {
  const [data, setData] = useState<LauncherData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const results: LauncherData[] = [];

      for (const region of launcherTargets) {
        for (const app of region.apps) {
          const itemData: LauncherData = {
            regionId: region.id,
            app,
            zips: [],
            exes: [],
          };

          // Zip
          try {
            const urlZip = `${BASE_URL}/akEndfield/launcher/launcher/${app}/${region.channel}/all.json`;
            const dataZip = await fetchJson<StoredData<any>[]>(urlZip);
            itemData.zips = [...dataZip].reverse().map((e) => {
              const fileName = new URL(e.rsp.zip_package_url).pathname.split('/').pop() ?? '';
              const unpacked = parseInt(e.rsp.total_size) - parseInt(e.rsp.package_size);
              return {
                dateStr: DateTime.fromISO(e.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss'),
                version: e.rsp.version,
                fileName,
                md5: e.rsp.md5,
                unpackedStr: math.formatFileSize(unpacked, FILE_SIZE_OPTS),
                packedStr: math.formatFileSize(parseInt(e.rsp.package_size), FILE_SIZE_OPTS),
                url: e.rsp.zip_package_url,
              };
            });
          } catch (e) {}

          // Exe
          try {
            const urlExe = `${BASE_URL}/akEndfield/launcher/launcherExe/${app}/${region.channel}/all.json`;
            const dataExe = await fetchJson<StoredData<any>[]>(urlExe);
            itemData.exes = [...dataExe].reverse().map((e) => {
              const fileName = new URL(e.rsp.exe_url).pathname.split('/').pop() ?? '';
              return {
                dateStr: DateTime.fromISO(e.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss'),
                version: e.rsp.version,
                fileName,
                sizeStr: math.formatFileSize(parseInt(e.rsp.exe_size), FILE_SIZE_OPTS),
                url: e.rsp.exe_url,
              };
            });
          } catch (e) {}

          if (itemData.zips.length > 0 || itemData.exes.length > 0) {
            results.push(itemData);
          }
        }
      }
      setData(results);
      setLoading(false);
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className='text-center p-5'>
        <div className='spinner-border' role='status'></div>
      </div>
    );
  }

  return (
    <div>
      {data.map((item) => (
        <div key={`${item.regionId}-${item.app}`} className='mb-5'>
          <h3 className='mb-3'>
            {item.regionId.toUpperCase()} {item.app}
          </h3>
          <div className='accordion' id={`accordion-launcher-${item.regionId}-${item.app}`}>
            {item.zips.length > 0 && (
              <div className='accordion-item'>
                <h2 className='accordion-header' id={`heading-zip-${item.regionId}-${item.app}`}>
                  <button
                    className='accordion-button collapsed'
                    type='button'
                    data-bs-toggle='collapse'
                    data-bs-target={`#collapse-zip-${item.regionId}-${item.app}`}
                    aria-expanded='false'
                    aria-controls={`collapse-zip-${item.regionId}-${item.app}`}
                  >
                    Launcher Packages (zip)
                  </button>
                </h2>
                <div
                  id={`collapse-zip-${item.regionId}-${item.app}`}
                  className='accordion-collapse collapse'
                  data-bs-parent={`#accordion-launcher-${item.regionId}-${item.app}`}
                >
                  <div className='accordion-body'>
                    <div className='table-responsive'>
                      <table className='table table-striped table-bordered table-sm align-middle text-nowrap'>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Version</th>
                            <th>File</th>
                            <th>MD5 Checksum</th>
                            <th className='text-end'>Unpacked</th>
                            <th className='text-end'>Packed</th>
                            <th className='text-center'>DL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.zips.map((z, idx) => (
                            <tr key={idx}>
                              <td>{z.dateStr}</td>
                              <td>{z.version}</td>
                              <td>{z.fileName}</td>
                              <td>
                                <code>{z.md5}</code>
                              </td>
                              <td className='text-end'>{z.unpackedStr}</td>
                              <td className='text-end'>{z.packedStr}</td>
                              <td
                                className='text-center'
                                dangerouslySetInnerHTML={{ __html: generateDownloadLinks(z.url, mirrorFileDb) }}
                              ></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {item.exes.length > 0 && (
              <div className='accordion-item'>
                <h2 className='accordion-header' id={`heading-exe-${item.regionId}-${item.app}`}>
                  <button
                    className='accordion-button collapsed'
                    type='button'
                    data-bs-toggle='collapse'
                    data-bs-target={`#collapse-exe-${item.regionId}-${item.app}`}
                    aria-expanded='false'
                    aria-controls={`collapse-exe-${item.regionId}-${item.app}`}
                  >
                    Launcher Packages (Installer)
                  </button>
                </h2>
                <div
                  id={`collapse-exe-${item.regionId}-${item.app}`}
                  className='accordion-collapse collapse'
                  data-bs-parent={`#accordion-launcher-${item.regionId}-${item.app}`}
                >
                  <div className='accordion-body'>
                    <div className='table-responsive'>
                      <table className='table table-striped table-bordered table-sm align-middle text-nowrap'>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Version</th>
                            <th>File</th>
                            <th className='text-end'>Size</th>
                            <th className='text-center'>DL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.exes.map((e, idx) => (
                            <tr key={idx}>
                              <td>{e.dateStr}</td>
                              <td>{e.version}</td>
                              <td>{e.fileName}</td>
                              <td className='text-end'>{e.sizeStr}</td>
                              <td
                                className='text-center'
                                dangerouslySetInnerHTML={{ __html: generateDownloadLinks(e.url, mirrorFileDb) }}
                              ></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
