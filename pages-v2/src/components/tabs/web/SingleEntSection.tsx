import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import type { LauncherWebSingleEnt, StoredData } from '../../../types';
import { fetchJson } from '../../../utils/api';
import { BASE_URL } from '../../../utils/constants';

interface Props {
  target: { region: 'os' | 'cn'; dirName: string };
  lang: string;
}

const getMirrorUrl = (url: string) => {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `https://raw.githubusercontent.com/daydreamer-json/ak-endfield-api-archive/refs/heads/main/output/raw/${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
};

export default function SingleEntSection({ target, lang }: Props) {
  const [entMap, setEntMap] = useState<Map<string, { ent: LauncherWebSingleEnt['single_ent']; firstSeen: string }>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const collapseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = collapseRef.current;
    if (!el) return;

    const handleShow = () => setShouldLoad(true);
    el.addEventListener('show.bs.collapse', handleShow);
    return () => el.removeEventListener('show.bs.collapse', handleShow);
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!lang || !shouldLoad) return;
      setLoading(true);
      const url = `${BASE_URL}/akEndfield/launcher/web/${target.dirName}/single_ent/${lang}/all.json`;
      try {
        const data = await fetchJson<StoredData<LauncherWebSingleEnt>[]>(url);
        const newEntMap = new Map<string, { ent: LauncherWebSingleEnt['single_ent']; firstSeen: string }>();
        const sortedData = [...data].sort(
          (a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis(),
        );

        for (const entry of sortedData) {
          if (!entry.rsp || !entry.rsp.single_ent) continue;
          const ent = entry.rsp.single_ent;
          const key = ent.version_md5 || ent.version_url;
          if (!newEntMap.has(key)) {
            newEntMap.set(key, { ent, firstSeen: entry.updatedAt });
          }
        }
        setEntMap(newEntMap);
      } catch (e) {
        setEntMap(new Map());
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [target, lang, shouldLoad]);

  return (
    <div className='card mb-3'>
      <div
        className='card-header d-flex justify-content-between align-items-center'
        style={{ cursor: 'pointer' }}
        data-bs-toggle='collapse'
        data-bs-target='#collapseSingleEnt'
        role='button'
      >
        <h3 className='h4 mb-0'>Single Ent.</h3>
        <i className='bi bi-chevron-down'></i>
      </div>
      <div id='collapseSingleEnt' className='collapse' ref={collapseRef}>
        <div className='card-body'>
          {loading ? (
            <div className='text-muted p-2'>Loading single entry data...</div>
          ) : entMap.size === 0 ? (
            <div className='text-muted p-2'>No data found.</div>
          ) : (
            <div className='row row-cols-1 row-cols-md-2 g-4'>
              {Array.from(entMap.entries()).map(([key, { ent, firstSeen }]) => (
                <div key={key} className='col'>
                  <div className='card h-100 shadow-sm'>
                    <div className='card-body'>
                      <div className='d-flex justify-content-between align-items-center mb-3'>
                        <span className='text-muted small'>
                          First seen: {DateTime.fromISO(firstSeen).toFormat('yyyy/MM/dd HH:mm')}
                        </span>
                        {ent.need_token && <span className='badge bg-warning text-dark'>Auth</span>}
                      </div>
                      <div className='mb-3'>
                        <label className='form-label small fw-bold'>Version Image</label>
                        <a href={getMirrorUrl(ent.version_url)} target='_blank' rel='noreferrer'>
                          <img
                            src={getMirrorUrl(ent.version_url)}
                            className='img-fluid rounded border'
                            alt='Version'
                            loading='lazy'
                          />
                        </a>
                        <p
                          className='text-muted font-monospace mt-1'
                          style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}
                        >
                          MD5: {ent.version_md5}
                        </p>
                      </div>
                      {ent.button_url && (
                        <div className='mb-3'>
                          <label className='form-label small fw-bold'>Action Button</label>
                          <div className='d-flex gap-2'>
                            <div className='flex-grow-1 text-center'>
                              <img
                                src={getMirrorUrl(ent.button_url)}
                                className='img-fluid rounded border bg-light'
                                alt='Button'
                                style={{ maxHeight: '60px' }}
                                loading='lazy'
                              />
                              <p className='text-muted small mt-1 mb-0'>Normal</p>
                            </div>
                            {ent.button_hover_url && (
                              <div className='flex-grow-1 text-center'>
                                <img
                                  src={getMirrorUrl(ent.button_hover_url)}
                                  className='img-fluid rounded border bg-light'
                                  alt='Button Hover'
                                  style={{ maxHeight: '60px' }}
                                  loading='lazy'
                                />
                                <p className='text-muted small mt-1 mb-0'>Hover</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {ent.jump_url && (
                        <a
                          href={ent.jump_url}
                          target='_blank'
                          rel='noreferrer'
                          className='btn btn-sm btn-outline-primary w-100'
                        >
                          Jump URL
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
