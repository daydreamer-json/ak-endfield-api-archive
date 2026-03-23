import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import type { LauncherWebAnnouncement, StoredData } from '../../../types';
import { fetchJson } from '../../../utils/api';
import { BASE_URL } from '../../../utils/constants';

interface Props {
  target: { region: 'os' | 'cn'; dirName: string };
  lang: string;
}

interface TabData {
  tabName: string;
  announcements: any[];
}

export default function AnnouncementSection({ target, lang }: Props) {
  const [tabs, setTabs] = useState<Map<string, TabData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(true);
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
      const url = `${BASE_URL}/akEndfield/launcher/web/${target.dirName}/announcement/${lang}/all.json`;
      try {
        const data = await fetchJson<StoredData<LauncherWebAnnouncement>[]>(url);
        const newTabsMap = new Map<string, TabData>();
        const sortedData = [...data].sort(
          (a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis(),
        );

        for (const entry of sortedData) {
          if (!entry.rsp || !entry.rsp.tabs) continue;
          for (const tab of entry.rsp.tabs) {
            if (!newTabsMap.has(tab.tab_id)) {
              newTabsMap.set(tab.tab_id, { tabName: tab.tabName, announcements: [] });
            }
            const targetTab = newTabsMap.get(tab.tab_id)!;
            for (const ann of tab.announcements) {
              if (!targetTab.announcements.some((a: any) => a.id === ann.id)) {
                targetTab.announcements.push(ann);
              }
            }
          }
        }
        setTabs(newTabsMap);
      } catch (e) {
        setTabs(new Map());
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
        data-bs-target='#collapseAnnouncement'
        role='button'
      >
        <h3 className='h4 mb-0'>Announcement</h3>
        <i className='bi bi-chevron-down'></i>
      </div>
      <div id='collapseAnnouncement' className='collapse show' ref={collapseRef}>
        <div className='card-body'>
          {loading ? (
            <div className='text-muted p-2'>Loading announcements...</div>
          ) : tabs.size === 0 ? (
            <div className='text-muted p-2'>No announcements found.</div>
          ) : (
            Array.from(tabs.entries()).map(([tabId, tabData]) => (
              <div key={tabId} className='card mb-4 shadow-sm'>
                <div className='card-header text-white fw-bold py-1'>{tabData.tabName}</div>
                <ul className='list-group list-group-flush'>
                  {tabData.announcements
                    .sort((a, b) => parseInt(b.start_ts) - parseInt(a.start_ts))
                    .map((ann) => (
                      <li key={ann.id} className='list-group-item py-2'>
                        <div className='d-flex flex-wrap align-items-center gap-2'>
                          <span className='text-muted small' style={{ minWidth: '120px' }}>
                            {DateTime.fromMillis(parseInt(ann.start_ts)).toFormat('yyyy/MM/dd HH:mm')}
                          </span>
                          <span className='flex-grow-1 fw-bold'>{ann.content}</span>
                          <div className='d-flex align-items-center gap-2'>
                            {ann.need_token && (
                              <span className='badge bg-warning text-dark px-1 py-0' style={{ fontSize: '0.7rem' }}>
                                Auth
                              </span>
                            )}
                            {ann.jump_url && (
                              <a
                                href={ann.jump_url}
                                target='_blank'
                                rel='noreferrer'
                                className='btn btn-sm btn-outline-secondary py-0 px-2'
                                style={{ fontSize: '0.75rem' }}
                              >
                                Link
                              </a>
                            )}
                            <span className='text-muted border-start ps-2' style={{ fontSize: '0.7rem' }}>
                              ID:{ann.id}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
