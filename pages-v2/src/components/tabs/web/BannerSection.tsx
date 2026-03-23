import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import type { LauncherWebBanner, StoredData } from '../../../types';
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

export default function BannerSection({ target, lang }: Props) {
  const [bannerMap, setBannerMap] = useState<
    Map<string, { banner: LauncherWebBanner['banners'][0]; firstSeen: string }>
  >(new Map());
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
      const url = `${BASE_URL}/akEndfield/launcher/web/${target.dirName}/banner/${lang}/all.json`;
      try {
        const data = await fetchJson<StoredData<LauncherWebBanner>[]>(url);
        const newBannerMap = new Map<string, { banner: LauncherWebBanner['banners'][0]; firstSeen: string }>();
        const sortedData = [...data].sort(
          (a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis(),
        );

        for (const entry of sortedData) {
          if (!entry.rsp || !entry.rsp.banners) continue;
          for (const banner of entry.rsp.banners) {
            if (!newBannerMap.has(banner.id)) {
              newBannerMap.set(banner.id, { banner, firstSeen: entry.updatedAt });
            }
          }
        }
        setBannerMap(newBannerMap);
      } catch (e) {
        setBannerMap(new Map());
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
        data-bs-target='#collapseBanner'
        role='button'
      >
        <h3 className='h4 mb-0'>Banner</h3>
        <i className='bi bi-chevron-down'></i>
      </div>
      <div id='collapseBanner' className='collapse' ref={collapseRef}>
        <div className='card-body'>
          {loading ? (
            <div className='text-muted p-2'>Loading banners...</div>
          ) : bannerMap.size === 0 ? (
            <div className='text-muted p-2'>No banners found.</div>
          ) : (
            <div className='row row-cols-1 row-cols-md-3 row-cols-lg-4 g-3'>
              {Array.from(bannerMap.entries()).map(([id, { banner, firstSeen }]) => {
                const dateStr = DateTime.fromISO(firstSeen).toFormat('yyyy/MM/dd HH:mm');
                const mirrorUrl = getMirrorUrl(banner.url);
                const linkUrl = banner.jump_url || mirrorUrl;
                return (
                  <div key={id} className='col'>
                    <a href={linkUrl} target='_blank' rel='noreferrer' className='text-decoration-none text-reset'>
                      <div className='card h-100 shadow-sm border-0'>
                        <div className='position-relative'>
                          <img
                            src={mirrorUrl}
                            className='card-img-top rounded'
                            alt='Banner'
                            style={{ objectFit: 'cover', aspectRatio: '16 / 9' }}
                            loading='lazy'
                          />
                          <div className='position-absolute top-0 end-0 p-1'>
                            {banner.need_token && (
                              <span className='badge bg-warning text-dark' style={{ fontSize: '0.6rem' }}>
                                Auth
                              </span>
                            )}
                          </div>
                        </div>
                        <div className='card-body py-1 px-1'>
                          <div
                            className='d-flex justify-content-between align-items-center'
                            style={{ fontSize: '0.7rem' }}
                          >
                            <span className='text-muted text-truncate me-1'>ID: {id}</span>
                            <span className='text-muted flex-shrink-0'>{dateStr}</span>
                          </div>
                        </div>
                      </div>
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
