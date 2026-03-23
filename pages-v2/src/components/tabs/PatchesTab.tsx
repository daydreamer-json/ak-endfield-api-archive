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

interface PatchData {
  targetName: string;
  region: 'os' | 'cn';
  dirName: string;
  patches: Array<{
    version: string;
    reqVersion: string;
    dateStr: string;
    packedSizeStr: string;
    unpackedSizeStr: string;
    files: Array<{
      fileName: string;
      md5: string;
      sizeStr: string;
      url: string;
    }>;
  }>;
}

export default function PatchesTab({ mirrorFileDb }: Props) {
  const [patchesData, setPatchesData] = useState<PatchData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const promises = gameTargets.map(async (target) => {
        const url = `${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all_patch.json`;
        try {
          const data = await fetchJson<StoredData<any>[]>(url);
          if (data.length === 0) return null;

          const patches = [...data]
            .reverse()
            .map((e) => {
              if (!e.rsp.patch) return null;
              const version = e.rsp.version;
              const reqVersion = e.rsp.request_version;
              const dateStr = DateTime.fromISO(e.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss');

              let packedSize = 0;
              if (e.rsp.patch.patches) {
                packedSize = math.arrayTotal(e.rsp.patch.patches.map((f: any) => parseInt(f.package_size)));
              }

              const totalSize = parseInt(e.rsp.patch.total_size);
              const unpackedSize = totalSize - packedSize;

              const files = [];
              if (e.rsp.patch.url) {
                files.push({
                  fileName: new URL(e.rsp.patch.url).pathname.split('/').pop() ?? '',
                  md5: e.rsp.patch.md5,
                  sizeStr: math.formatFileSize(parseInt(e.rsp.patch.package_size), FILE_SIZE_OPTS),
                  url: e.rsp.patch.url,
                });
              }
              if (e.rsp.patch.patches) {
                e.rsp.patch.patches.forEach((f: any) => {
                  files.push({
                    fileName: new URL(f.url).pathname.split('/').pop() ?? '',
                    md5: f.md5,
                    sizeStr: math.formatFileSize(parseInt(f.package_size), FILE_SIZE_OPTS),
                    url: f.url,
                  });
                });
              }

              return {
                version,
                reqVersion,
                dateStr,
                packedSizeStr: math.formatFileSize(packedSize, FILE_SIZE_OPTS),
                unpackedSizeStr: math.formatFileSize(unpackedSize, FILE_SIZE_OPTS),
                files,
              };
            })
            .filter((p): p is NonNullable<typeof p> => p !== null);

          return {
            targetName: target.name,
            region: target.region,
            dirName: target.dirName,
            patches,
          };
        } catch (err) {
          return null;
        }
      });

      const results = await Promise.all(promises);
      const validResults = results.filter((r): r is PatchData => r !== null);

      const sortedResults = gameTargets
        .map((t) => validResults.find((r) => r.dirName === t.dirName))
        .filter((r): r is PatchData => r !== undefined && r !== null);

      setPatchesData(sortedResults);
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
      {patchesData.map((pkg) => (
        <div key={pkg.dirName} className='mb-5'>
          <h3 className='mb-3'>
            {pkg.region === 'cn' ? 'China' : 'Global'}, {pkg.targetName}
          </h3>
          <div className='accordion' id={`accordion-patch-${pkg.dirName}`}>
            {pkg.patches.map((ver, idx) => {
              const itemId = `patch-${pkg.dirName}-${idx}`;
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
                        <span className='fw-bold'>
                          {ver.reqVersion} → {ver.version}
                        </span>
                        <span className='text-muted small align-bottom'>{ver.dateStr}</span>
                      </div>
                    </button>
                  </h2>
                  <div
                    id={`collapse-${itemId}`}
                    className='accordion-collapse collapse'
                    aria-labelledby={`heading-${itemId}`}
                    data-bs-parent={`#accordion-patch-${pkg.dirName}`}
                  >
                    <div className='accordion-body'>
                      <table className='table table-sm table-borderless w-auto mb-2'>
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
                            {ver.files.map((file, pIdx) => (
                              <tr key={pIdx}>
                                <td>{file.fileName}</td>
                                <td>
                                  <code>{file.md5}</code>
                                </td>
                                <td className='text-end'>{file.sizeStr}</td>
                                <td
                                  className='text-center'
                                  dangerouslySetInnerHTML={{ __html: generateDownloadLinks(file.url, mirrorFileDb) }}
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
