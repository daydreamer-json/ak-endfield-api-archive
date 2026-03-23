import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import type { MirrorFileEntry, StoredData } from '../../types';
import { fetchJson } from '../../utils/api';
import { BASE_URL, FILE_SIZE_OPTS, gameTargets } from '../../utils/constants';
import math from '../../utils/math';
import { generateDownloadLinks } from '../../utils/ui';

interface Props {
  mirrorFileDb: MirrorFileEntry[];
}

interface GamePackageData {
  targetName: string;
  region: 'os' | 'cn';
  dirName: string;
  versions: Array<{
    version: string;
    dateStr: string;
    packedSizeStr: string;
    unpackedSizeStr: string;
    packs: Array<{
      fileName: string;
      md5: string;
      sizeStr: string;
      url: string;
    }>;
  }>;
}

export default function GamePackagesTab({ mirrorFileDb }: Props) {
  const [packages, setPackages] = useState<GamePackageData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const promises = gameTargets.map(async (target) => {
        const url = `${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all.json`;
        try {
          const data = await fetchJson<StoredData<any>[]>(url);
          const list = [...data].reverse();

          const versions = list
            .map((e) => {
              if (!e) return null;
              const version = e.rsp.version;
              const dateStr = DateTime.fromISO(e.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss');

              const packSizes = e.rsp.pkg.packs.map((f: any) => parseInt(f.package_size));
              const packedSize = math.arrayTotal(packSizes);
              const totalSize = parseInt(e.rsp.pkg.total_size);
              const unpackedSize = totalSize - packedSize;

              const packs = e.rsp.pkg.packs.map((f: any) => ({
                fileName: new URL(f.url).pathname.split('/').pop() ?? '',
                md5: f.md5,
                sizeStr: math.formatFileSize(parseInt(f.package_size), FILE_SIZE_OPTS),
                url: f.url,
              }));

              return {
                version,
                dateStr,
                packedSizeStr: math.formatFileSize(packedSize, FILE_SIZE_OPTS),
                unpackedSizeStr: math.formatFileSize(unpackedSize, FILE_SIZE_OPTS),
                packs,
              };
            })
            .filter((v): v is NonNullable<typeof v> => v !== null);

          return {
            targetName: target.name,
            region: target.region,
            dirName: target.dirName,
            versions,
          };
        } catch (err) {
          return null;
        }
      });

      const results = await Promise.all(promises);
      const validResults = results.filter((r): r is GamePackageData => r !== null);

      const sortedResults = gameTargets
        .map((t) => validResults.find((r) => r.dirName === t.dirName))
        .filter((r): r is GamePackageData => r !== undefined && r !== null);

      setPackages(sortedResults);
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
      {packages.map((pkg) => (
        <div key={pkg.dirName} className='mb-5'>
          <h3 className='mb-3'>
            {pkg.region === 'cn' ? 'China' : 'Global'}, {pkg.targetName}
          </h3>
          <div className='accordion' id={`accordion-game-${pkg.dirName}`}>
            {pkg.versions.map((ver, idx) => {
              const itemId = `game-${pkg.dirName}-${idx}`;
              return (
                <div className='accordion-item' key={itemId}>
                  <h2 className='accordion-header' id={`heading-${itemId}`}>
                    <button
                      className='accordion-button collapsed'
                      type='button'
                      data-bs-toggle='collapse'
                      data-bs-target={`#collapse-${itemId}`}
                      aria-expanded='false'
                      aria-controls={`collapse-${itemId}`}
                    >
                      <div className='d-flex w-100 justify-content-between me-3'>
                        <span className='fw-bold'>{ver.version}</span>
                        <span className='text-muted small align-bottom'>{ver.dateStr}</span>
                      </div>
                    </button>
                  </h2>
                  <div
                    id={`collapse-${itemId}`}
                    className='accordion-collapse collapse'
                    aria-labelledby={`heading-${itemId}`}
                    data-bs-parent={`#accordion-game-${pkg.dirName}`}
                  >
                    <div className='accordion-body'>
                      <table className='table table-sm table-transparent table-borderless w-auto mb-2'>
                        <tbody>
                          <tr>
                            <td>Unpacked Size</td>
                            <td className='text-end fw-bold'>{ver.unpackedSizeStr}</td>
                          </tr>
                          <tr>
                            <td>Packed Size</td>
                            <td className='text-end fw-bold'>{ver.packedSizeStr}</td>
                          </tr>
                        </tbody>
                      </table>
                      <div className='table-responsive'>
                        <table className='table table-striped table-bordered table-sm align-middle text-nowrap'>
                          <thead>
                            <tr>
                              <th>File</th>
                              <th>MD5 Checksum</th>
                              <th className='text-end'>Size</th>
                              <th className='text-center'>DL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ver.packs.map((pack, pIdx) => (
                              <tr key={pIdx}>
                                <td>{pack.fileName}</td>
                                <td>
                                  <code>{pack.md5}</code>
                                </td>
                                <td className='text-end'>{pack.sizeStr}</td>
                                <td
                                  className='text-center'
                                  dangerouslySetInnerHTML={{ __html: generateDownloadLinks(pack.url, mirrorFileDb) }}
                                ></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
