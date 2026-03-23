import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import type { LauncherWebMainBgImage, StoredData } from '../../../types';
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

export default function MainBgImageSection({ target, lang }: Props) {
  const [imageMap, setImageMap] = useState<
    Map<string, { image: LauncherWebMainBgImage['main_bg_image']; firstSeen: string }>
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
      const url = `${BASE_URL}/akEndfield/launcher/web/${target.dirName}/main_bg_image/${lang}/all.json`;
      try {
        const data = await fetchJson<StoredData<LauncherWebMainBgImage>[]>(url);
        const newImageMap = new Map<string, { image: LauncherWebMainBgImage['main_bg_image']; firstSeen: string }>();
        const sortedData = [...data].sort(
          (a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis(),
        );

        for (const entry of sortedData) {
          if (!entry.rsp || !entry.rsp.main_bg_image) continue;
          const img = entry.rsp.main_bg_image;
          if (!newImageMap.has(img.md5)) {
            newImageMap.set(img.md5, { image: img, firstSeen: entry.updatedAt });
          }
        }
        setImageMap(newImageMap);
      } catch (e) {
        setImageMap(new Map());
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
        data-bs-target='#collapseMainBgImage'
        role='button'
      >
        <h3 className='h4 mb-0'>Main Background Image</h3>
        <i className='bi bi-chevron-down'></i>
      </div>
      <div id='collapseMainBgImage' className='collapse' ref={collapseRef}>
        <div className='card-body'>
          {loading ? (
            <div className='text-muted p-2'>Loading background images...</div>
          ) : imageMap.size === 0 ? (
            <div className='text-muted p-2'>No images found.</div>
          ) : (
            <div className='row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3'>
              {Array.from(imageMap.entries()).map(([md5, { image, firstSeen }]) => {
                const dateStr = DateTime.fromISO(firstSeen).toFormat('yyyy/MM/dd HH:mm');
                const mirrorUrl = getMirrorUrl(image.url);
                const linkUrl = image.video_url ? getMirrorUrl(image.video_url) : mirrorUrl;
                return (
                  <div key={md5} className='col'>
                    <a href={linkUrl} target='_blank' rel='noreferrer' className='text-decoration-none text-reset'>
                      <div className='card h-100 shadow-sm border-0'>
                        <div className='position-relative'>
                          <img
                            src={mirrorUrl}
                            className='card-img-top rounded'
                            alt='Background'
                            style={{ objectFit: 'cover', aspectRatio: '16 / 9' }}
                            loading='lazy'
                          />
                          <div className='position-absolute top-0 end-0 p-1'>
                            {image.video_url && (
                              <span className='badge bg-primary' style={{ fontSize: '0.6rem' }}>
                                Video
                              </span>
                            )}
                          </div>
                        </div>
                        <div className='card-body py-1 px-1'>
                          <div
                            className='d-flex justify-content-between align-items-center'
                            style={{ fontSize: '0.7rem' }}
                          >
                            <span className='text-muted text-truncate font-monospace me-1'>{md5}</span>
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
