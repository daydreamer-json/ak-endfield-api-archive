import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import type { LauncherWebSidebar, StoredData } from '../../../types';
import { fetchJson } from '../../../utils/api';
import { BASE_URL } from '../../../utils/constants';

interface Props {
  target: { region: 'os' | 'cn'; dirName: string };
  lang: string;
}

const getMirrorUrl = (url: string) => {
  try {
    const u = new URL(url);
    return `https://raw.githubusercontent.com/daydreamer-json/ak-endfield-api-archive/refs/heads/main/output/raw/${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
};

export default function SidebarSection({ target, lang }: Props) {
  const [latestSidebar, setLatestSidebar] = useState<{
    sidebars: LauncherWebSidebar['sidebars'];
    updatedAt: string;
  } | null>(null);
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
      const url = `${BASE_URL}/akEndfield/launcher/web/${target.dirName}/sidebar/${lang}/all.json`;
      try {
        const data = await fetchJson<StoredData<LauncherWebSidebar>[]>(url);
        const sortedData = [...data].sort(
          (a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis(),
        );

        const latest = sortedData[0];
        if (latest && latest.rsp && latest.rsp.sidebars) {
          setLatestSidebar({ sidebars: latest.rsp.sidebars, updatedAt: latest.updatedAt });
        } else {
          setLatestSidebar(null);
        }
      } catch (e) {
        setLatestSidebar(null);
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
        data-bs-target='#collapseSidebar'
        role='button'
      >
        <h3 className='h4 mb-0'>Sidebar</h3>
        <i className='bi bi-chevron-down'></i>
      </div>
      <div id='collapseSidebar' className='collapse' ref={collapseRef}>
        <div className='card-body'>
          {loading ? (
            <div className='text-muted p-2'>Loading sidebar data...</div>
          ) : !latestSidebar ? (
            <div className='text-muted p-2'>No active sidebars.</div>
          ) : (
            <>
              <div className='row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3'>
                {latestSidebar.sidebars.map((item, idx) => (
                  <div key={idx} className='col'>
                    <div className='card h-100 shadow-sm'>
                      <div className='card-body'>
                        <div className='d-flex justify-content-between align-items-center mb-2'>
                          <h5 className='card-title mb-0'>{item.media}</h5>
                          {item.need_token && <span className='badge bg-warning text-dark lh-1 py-1'>Auth</span>}
                        </div>
                        {item.pic && (
                          <div className='mb-3'>
                            <img
                              src={getMirrorUrl(item.pic.url)}
                              className='img-fluid rounded'
                              alt={item.pic.description}
                              loading='lazy'
                            />
                            <p className='text-muted small mt-1 mb-0'>{item.pic.description}</p>
                          </div>
                        )}
                        {item.jump_url && (
                          <a
                            href={item.jump_url}
                            target='_blank'
                            rel='noreferrer'
                            className='btn btn-sm btn-outline-primary mb-2 w-100'
                          >
                            Open Link
                          </a>
                        )}
                        {item.sidebar_labels && item.sidebar_labels.length > 0 && (
                          <div className='list-group list-group-flush border-top mt-2'>
                            {item.sidebar_labels.map((label, lIdx) => (
                              <a
                                key={lIdx}
                                href={label.jump_url}
                                target='_blank'
                                rel='noreferrer'
                                className='list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 px-0'
                              >
                                <span style={{ fontSize: '0.9rem' }}>{label.content}</span>
                                <div className='d-flex gap-1'>
                                  {label.need_token && (
                                    <span className='badge bg-warning text-dark lh-1 py-1'>Auth</span>
                                  )}
                                  <i className='bi bi-box-arrow-up-right small text-muted'></i>
                                </div>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className='text-muted small mt-3 text-end'>
                Last updated: {DateTime.fromISO(latestSidebar.updatedAt).toFormat('yyyy/MM/dd HH:mm')}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
