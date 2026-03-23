import { useEffect, useState } from 'react';
import AboutTab from './components/tabs/AboutTab';
import GamePackagesTab from './components/tabs/GamePackagesTab';
import LauncherTab from './components/tabs/LauncherTab';
import OverviewTab from './components/tabs/OverviewTab';
import PatchesTab from './components/tabs/PatchesTab';
import ResourcesTab from './components/tabs/ResourcesTab';
import WebTab from './components/tabs/WebTab';
import type { LauncherWebMainBgImage, MirrorFileEntry, StoredData } from './types';
import { fetchJson, preloadData } from './utils/api';
import { BASE_URL } from './utils/constants';

const getMirrorUrl = (url: string) => {
  try {
    const u = new URL(url);
    return `https://raw.githubusercontent.com/daydreamer-json/ak-endfield-api-archive/refs/heads/main/output/raw/${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
};

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [mirrorFileDb, setMirrorFileDb] = useState<MirrorFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgVisible, setBgVisible] = useState(false);

  useEffect(() => {
    const getPreferredTheme = () => {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };
    const setTheme = (theme: string) => {
      document.documentElement.setAttribute('data-bs-theme', theme);
    };

    setTheme(getPreferredTheme());

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setTheme(getPreferredTheme());
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await preloadData();
      } catch (e) {
        console.warn('Preload failed', e);
      }

      // Fetch mirror list
      try {
        const db = await fetchJson<MirrorFileEntry[]>(`${BASE_URL}/mirror_file_list.json`);
        setMirrorFileDb(db);
      } catch (e) {
        console.warn('Failed to fetch mirror list', e);
      } finally {
        setLoading(false);
      }

      // Fetch latest background image
      try {
        const url = `${BASE_URL}/akEndfield/launcher/web/6/main_bg_image/en-us/all.json`;
        const data = await fetchJson<StoredData<LauncherWebMainBgImage>[]>(url);
        if (data.length > 0) {
          // Sort by updatedAt descending
          const sorted = data.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          const latest = sorted.find((entry) => entry.rsp?.main_bg_image?.url);
          if (latest?.rsp?.main_bg_image?.url) {
            const mirrorUrl = getMirrorUrl(latest.rsp.main_bg_image.url);

            // Preload the image
            const img = new Image();
            img.src = mirrorUrl;
            img.onload = () => {
              setBgImage(mirrorUrl);
              // Small delay to trigger transition
              setTimeout(() => setBgVisible(true), 1);
            };
          }
        }
      } catch (e) {
        console.warn('Failed to fetch background image', e);
      }
    };
    init();
  }, []);

  const renderContent = () => {
    if (loading) {
      return (
        <div className='text-center'>
          <div className='spinner-border' role='status'></div>
          <p>Loading data...</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'overview':
        return <OverviewTab mirrorFileDb={mirrorFileDb} />;
      case 'game':
        return <GamePackagesTab mirrorFileDb={mirrorFileDb} />;
      case 'patch':
        return <PatchesTab mirrorFileDb={mirrorFileDb} />;
      case 'resources':
        return <ResourcesTab />;
      case 'launcher':
        return <LauncherTab mirrorFileDb={mirrorFileDb} />;
      case 'web-pretty':
        return <WebTab />;
      case 'about':
        return <AboutTab />;
      default:
        return null;
    }
  };

  return (
    <>
      {(() => {
        const blurRadius = 4;
        const opacity = 0.3;

        const opacityAnimSec = 1;
        const blurAnimSec = 1;

        const blurRadiusTmp = bgVisible ? blurRadius : blurRadius * 2;
        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundImage: bgImage ? `url(${bgImage})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              zIndex: -1,
              opacity: bgVisible ? opacity : 0,
              transition: `opacity ${opacityAnimSec}s ease-in-out`,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backdropFilter: `blur(${blurRadiusTmp}px)`,
                WebkitBackdropFilter: `blur(${blurRadiusTmp}px)`,
                transition: `backdrop-filter ${blurAnimSec}s ease-in-out`,
              }}
            />
          </div>
        );
      })()}
      <div className='container my-4 px-4' id='mainContainer'>
        <section>
          <h1 className='text-center fw-bold'>Arknights: Endfield API Archive</h1>
          <ul className='nav nav-tabs justify-content-center'>
            <li className='nav-item'>
              <button
                className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
            </li>
            <li className='nav-item'>
              <button
                className={`nav-link ${activeTab === 'game' ? 'active' : ''}`}
                onClick={() => setActiveTab('game')}
              >
                Game Packages
              </button>
            </li>
            <li className='nav-item'>
              <button
                className={`nav-link ${activeTab === 'patch' ? 'active' : ''}`}
                onClick={() => setActiveTab('patch')}
              >
                Patches
              </button>
            </li>
            <li className='nav-item'>
              <button
                className={`nav-link ${activeTab === 'resources' ? 'active' : ''}`}
                onClick={() => setActiveTab('resources')}
              >
                Resources
              </button>
            </li>
            <li className='nav-item'>
              <button
                className={`nav-link ${activeTab === 'launcher' ? 'active' : ''}`}
                onClick={() => setActiveTab('launcher')}
              >
                Launcher
              </button>
            </li>
            <li className='nav-item'>
              <button
                className={`nav-link ${activeTab === 'web-pretty' ? 'active' : ''}`}
                onClick={() => setActiveTab('web-pretty')}
              >
                Web
              </button>
            </li>
            <li className='nav-item'>
              <button
                className={`nav-link ${activeTab === 'about' ? 'active' : ''}`}
                onClick={() => setActiveTab('about')}
              >
                About
              </button>
            </li>
          </ul>
        </section>

        <section id='content' className='mt-4'>
          {renderContent()}
        </section>

        <hr />

        <section>
          <button
            id='debug-log-openBtn'
            className='d-none btn btn-secondary btn-sm'
            data-bs-toggle='modal'
            data-bs-target='#debug-log-modal'
          >
            Open Debug Log
          </button>
          <p className='text-center text-muted'>
            <small>(C) daydreamer-json and contributors</small>
          </p>
        </section>

        <div className='modal fade' id='debug-log-modal' tabIndex={-1}>
          <div className='modal-dialog modal-dialog-centered modal-dialog-scrollable'>
            <div className='modal-content'>
              <div className='modal-header'>
                <h1 className='modal-title fs-5' id='debug-log-modal-label'>
                  Debug Panel
                </h1>
                <button type='button' className='btn-close' data-bs-dismiss='modal'></button>
              </div>
              <div className='modal-body'>
                <section>
                  <p>Debug Log</p>
                  <pre id='debug-log'>
                    <code id='debug-log-inner'></code>
                  </pre>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
