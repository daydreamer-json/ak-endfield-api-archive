import DOMPurify from 'dompurify';
import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameHubBulletinAggregate, GameHubBulletinItem, StoredData } from '../../../types';
import { fetchJson } from '../../../utils/api';
import { BASE_URL } from '../../../utils/constants';

interface Props {
  target: { region: 'os' | 'cn'; dirName: string; channel: number };
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

const TAB_ORDER = ['news', 'updates', 'events'];

export default function BulletinSection({ target, lang }: Props) {
  const [bulletinType, setBulletinType] = useState<'game' | 'gate'>('game');
  const [items, setItems] = useState<GameHubBulletinItem[]>([]);
  const [selected, setSelected] = useState<GameHubBulletinItem | null>(null);
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
    if (!selected) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selected]);

  useEffect(() => {
    const load = async () => {
      if (!lang || !shouldLoad) return;
      setLoading(true);
      const serverSeg = target.region === 'cn' ? 'DEFAULT' : '3';
      const url = `${BASE_URL}/akEndfield/gameHub/bulletin/${target.channel}/${serverSeg}/${bulletinType}/${lang}/all.json`;
      try {
        const data = await fetchJson<StoredData<GameHubBulletinAggregate>[]>(url);
        const sortedData = [...data].sort(
          (a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis(),
        );

        const newItems: GameHubBulletinItem[] = [];
        for (const entry of sortedData) {
          if (!entry.rsp?.data?.list) continue;
          for (const item of entry.rsp.data.list) {
            if (!newItems.some((e) => e.cid === item.cid)) {
              if (item.title) item.title = item.title.replace(/\\n/g, ' ');
              newItems.push(item);
            }
          }
        }
        setItems(newItems);
      } catch (e) {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [target, lang, bulletinType, shouldLoad]);

  const tabNames = [
    ...TAB_ORDER.filter((t) => items.some((e) => e.tab === t)),
    ...[...new Set(items.map((e) => e.tab))].filter((t) => !TAB_ORDER.includes(t)),
  ];

  const renderModal = () => {
    if (!selected) return null;
    return createPortal(
      <>
        <div className='modal fade show d-block' tabIndex={-1} role='dialog' onClick={() => setSelected(null)}>
          <div
            className='modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='modal-content'>
              <div className='modal-header'>
                <div>
                  <h1 className='modal-title fs-5'>{selected.title}</h1>
                  <span className='text-muted' style={{ fontSize: '0.75rem' }}>
                    {DateTime.fromSeconds(selected.startAt).toFormat('yyyy/MM/dd HH:mm')} - ID:{selected.cid}
                  </span>
                </div>
                <button type='button' className='btn-close' onClick={() => setSelected(null)}></button>
              </div>
              <div className='modal-body'>
                {'html' in selected.data ? (
                  <>
                    {selected.displayType === 'rich_text' && selected.header && (
                      <h5 className='mb-3'>{selected.header}</h5>
                    )}
                    <div
                      className='bulletin-html'
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(
                          selected.data.html.replace(
                            /(<img[^>]+src=)["']([^"']+)["']/gi,
                            (_, prefix, url) => `${prefix}"${getMirrorUrl(url)}"`,
                          ),
                          { FORBID_ATTR: ['style'] },
                        ),
                      }}
                    />
                  </>
                ) : (
                  <div className='text-center'>
                    <img src={getMirrorUrl(selected.data.url)} className='img-fluid' alt={selected.title} />
                    {selected.data.link && (
                      <div className='mt-3'>
                        <a
                          href={selected.data.link}
                          target='_blank'
                          rel='noreferrer'
                          className='btn btn-sm btn-outline-secondary'
                        >
                          Link
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className='modal-backdrop fade show'></div>
      </>,
      document.body,
    );
  };

  return (
    <div className='card mb-3'>
      <div
        className='card-header d-flex justify-content-between align-items-center'
        style={{ cursor: 'pointer' }}
        data-bs-toggle='collapse'
        data-bs-target='#collapseBulletin'
        role='button'
      >
        <h3 className='h4 mb-0'>In-Game Bulletin</h3>
        <i className='bi bi-chevron-down'></i>
      </div>
      <div id='collapseBulletin' className='collapse show' ref={collapseRef}>
        <div className='card-body'>
          <div className='btn-group btn-group-sm mb-3' role='group'>
            <button
              type='button'
              className={`btn ${bulletinType === 'game' ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => setBulletinType('game')}
            >
              Full (game)
            </button>
            <button
              type='button'
              className={`btn ${bulletinType === 'gate' ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => setBulletinType('gate')}
            >
              Loading screen (gate)
            </button>
          </div>

          {loading ? (
            <div className='text-muted p-2'>Loading bulletins...</div>
          ) : items.length === 0 ? (
            <div className='text-muted p-2'>No bulletins found.</div>
          ) : (
            tabNames.map((tabName) => (
              <div key={tabName} className='card mb-4 shadow-sm'>
                <div className='card-header text-white fw-bold py-1 text-capitalize'>{tabName}</div>
                <ul className='list-group list-group-flush'>
                  {items
                    .filter((e) => e.tab === tabName)
                    .sort((a, b) => b.startAt - a.startAt)
                    .map((item) => (
                      <li
                        key={item.cid}
                        className='list-group-item py-2'
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelected(item)}
                      >
                        <div className='d-flex flex-wrap align-items-center gap-2'>
                          <span className='text-muted small' style={{ minWidth: '120px' }}>
                            {DateTime.fromSeconds(item.startAt).toFormat('yyyy/MM/dd HH:mm')}
                          </span>
                          <span className='flex-grow-1 fw-bold'>{item.title}</span>
                          <div className='d-flex align-items-center gap-2'>
                            <span className='badge bg-secondary lh-1 py-1' style={{ fontSize: '0.7rem' }}>
                              {item.displayType}
                            </span>
                            <span className='text-muted border-start ps-2' style={{ fontSize: '0.7rem' }}>
                              ID:{item.cid}
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
      {renderModal()}
    </div>
  );
}
