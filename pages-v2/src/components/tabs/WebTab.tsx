import { useEffect, useState } from 'react';
import { gameTargets, launcherWebApiLang } from '../../utils/constants';

import AnnouncementSection from './web/AnnouncementSection';
import BannerSection from './web/BannerSection';
import MainBgImageSection from './web/MainBgImageSection';
import SidebarSection from './web/SidebarSection';
import SingleEntSection from './web/SingleEntSection';

export default function WebTab() {
  const [targetIdx, setTargetIdx] = useState(0);
  const [lang, setLang] = useState('');

  const target = gameTargets[targetIdx]!;
  const langs = launcherWebApiLang[target.region] || [];

  useEffect(() => {
    const defaultLang = target.region === 'os' ? 'en-us' : 'zh-cn';
    if (langs.includes(defaultLang as any)) {
      setLang(defaultLang);
    } else if (langs.length > 0) {
      setLang(langs[0]);
    }
  }, [targetIdx, target.region, langs]);

  return (
    <div>
      {/* <div className='card'>
        <div className='card-body'> */}
      <div className='row g-3 mb-3'>
        <div className='col-md-6'>
          <label className='form-label fw-bold'>Target</label>
          <select className='form-select' value={targetIdx} onChange={(e) => setTargetIdx(parseInt(e.target.value))}>
            {gameTargets.map((t, idx) => (
              <option key={idx} value={idx}>
                {t.region === 'cn' ? 'China' : 'Global'} - {t.name}
              </option>
            ))}
          </select>
        </div>
        {langs.length > 1 && (
          <div className='col-md-6'>
            <label className='form-label fw-bold'>Language</label>
            <select className='form-select' value={lang} onChange={(e) => setLang(e.target.value)}>
              {langs.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* </div>
        </div> */}
      </div>

      <AnnouncementSection target={target} lang={lang} />
      <BannerSection target={target} lang={lang} />
      <MainBgImageSection target={target} lang={lang} />
      <SingleEntSection target={target} lang={lang} />
      <SidebarSection target={target} lang={lang} />
    </div>
  );
}
