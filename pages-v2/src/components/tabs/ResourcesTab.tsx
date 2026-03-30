import { Tooltip } from 'bootstrap';
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import semver from 'semver';
import type * as IApiEndfield from '../../../../src/types/api/akEndfield/Api';
import type { StoredData } from '../../types';
import { fetchJson } from '../../utils/api';
import { BASE_URL } from '../../utils/constants';

interface ResourceItem {
  name?: string;
  version: string;
  path: string;
}

interface ResourceGroup {
  resVersion: string;
  versions: string[];
  dateStr: string;
  intervalStr: string;
  initialRes: ResourceItem;
  mainRes: ResourceItem;
  isKick: boolean;
}

interface PlatformData {
  platform: string;
  groups: ResourceGroup[];
}

interface RegionData {
  region: string;
  channel: number;
  platforms: PlatformData[];
}

const PLATFORMS = ['Windows', 'Android', 'iOS', 'PlayStation'];
const TARGETS = [
  { region: 'os', channel: 6, label: 'Global' },
  { region: 'cn', channel: 1, label: 'China' },
];

const DEFAULT_RESOURCE: ResourceItem = { version: '?', path: '#' };

const getMirrorUrl = (url: string) => {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `https://raw.githubusercontent.com/daydreamer-json/ak-endfield-api-archive/refs/heads/main/output/raw/${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
};

function useResourcesData() {
  const [data, setData] = useState<RegionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAndProcessData = async () => {
      try {
        const regionPromises = TARGETS.map(async (target) => {
          const platformPromises = PLATFORMS.map(async (platform) => {
            try {
              const url = `${BASE_URL}/akEndfield/launcher/game_resources/${target.channel}/${platform}/all.json`;
              const rawData = await fetchJson<StoredData<IApiEndfield.LauncherLatestGameResources>[]>(url);

              const groups = processRawData(rawData);
              return groups.length > 0 ? { platform, groups } : null;
            } catch (error) {
              console.error(`Failed to fetch ${platform} for ${target.region}:`, error);
              return null;
            }
          });

          const platformsData = (await Promise.all(platformPromises)).filter((p): p is PlatformData => p !== null);
          return platformsData.length > 0
            ? { region: target.region, channel: target.channel, platforms: platformsData }
            : null;
        });

        const regionResults = (await Promise.all(regionPromises)).filter((r): r is RegionData => r !== null);
        setData(regionResults);
      } finally {
        setLoading(false);
      }
    };

    fetchAndProcessData();
  }, []);

  return { data, loading };
}

function processRawData(rawData: StoredData<IApiEndfield.LauncherLatestGameResources>[]): ResourceGroup[] {
  const resVersionMap = new Map<string, { rsp: any; gameVer: Set<string>; updatedAt: string }>();

  for (const e of rawData) {
    const resVer = e.rsp.res_version;
    if (!resVersionMap.has(resVer)) {
      resVersionMap.set(resVer, { rsp: e.rsp, gameVer: new Set(), updatedAt: e.updatedAt });
    }
    if (e.req.version) {
      resVersionMap.get(resVer)!.gameVer.add(e.req.version);
    }
  }

  const resVersionList = Array.from(resVersionMap.values())
    .map((d) => ({
      resVersion: d.rsp.res_version,
      rsp: d.rsp,
      gameVers: Array.from(d.gameVer).sort((a, b) => semver.rcompare(a, b)),
      updatedAt: d.updatedAt,
    }))
    .sort((a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis());

  return resVersionList.map((item, i, arr) => {
    const currentDate = DateTime.fromISO(item.updatedAt);
    const nextItem = arr[i + 1];

    let intervalStr = '-';
    if (nextItem) {
      const nextDate = DateTime.fromISO(nextItem.updatedAt);
      intervalStr = currentDate.diff(nextDate, ['days', 'hours', 'minutes', 'seconds']).toFormat('dd:hh:mm:ss');
    }

    const initialRes = item.rsp.resources?.find((e: any) => e.name === 'initial') || DEFAULT_RESOURCE;
    const mainRes = item.rsp.resources?.find((e: any) => e.name === 'main') || DEFAULT_RESOURCE;
    const isKick = JSON.parse(item.rsp.configs || '{}').kick_flag === true;

    return {
      resVersion: item.resVersion,
      versions: item.gameVers,
      dateStr: currentDate.toFormat('yyyy/MM/dd HH:mm:ss'),
      intervalStr,
      initialRes,
      mainRes,
      isKick,
    };
  });
}

const ResourceLink = ({ basePath, file, isDecExist }: { basePath: string; file: string; isDecExist: boolean }) => {
  const fullPath = `${basePath}/${file}`;
  return (
    <>
      <a href={fullPath} target='_blank' rel='noreferrer'>
        Orig
      </a>{' '}
      /{' '}
      <a href={getMirrorUrl(fullPath)} target='_blank' rel='noreferrer'>
        Mirror
      </a>
      {isDecExist ? (
        <>
          {' '}
          /{' '}
          <a href={getMirrorUrl(fullPath).replace(/\.json$/, '_dec.json')} target='_blank' rel='noreferrer'>
            Dec
          </a>
        </>
      ) : (
        ''
      )}
    </>
  );
};
const ResourceTable = ({ groups }: { groups: ResourceGroup[] }) => (
  <div className='table-responsive'>
    <table className='table table-striped table-bordered table-sm align-middle text-nowrap'>
      <thead>
        <tr>
          <th>Date</th>
          <th>Interval</th>
          <th>Version</th>
          <th>Game version</th>
          <th
            data-bs-toggle='tooltip'
            data-bs-trigger='hover focus'
            data-bs-title='If the game server wants to force clients to apply a hotfix update immediately, they will all be kicked from the server at once.'
            style={{ cursor: 'help', textDecoration: 'underline dotted' }}
            tabIndex={0}
          >
            Kick
          </th>
          <th>Initial</th>
          <th>Main</th>
          <th>Patch</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group, idx) => (
          <tr key={idx}>
            <td style={{ fontFeatureSettings: '"tnum"' }}>{group.dateStr}</td>
            <td style={{ fontFeatureSettings: '"tnum"' }}>{group.intervalStr}</td>
            <td>{group.initialRes.version === group.mainRes.version ? group.mainRes.version : group.resVersion}</td>
            <td>{group.versions.join(', ')}</td>
            <td className='text-center'>{group.isKick ? '✅' : ''}</td>
            <td>
              <ResourceLink basePath={group.initialRes.path} file='index_initial.json' isDecExist={true} />
            </td>
            <td>
              <ResourceLink basePath={group.mainRes.path} file='index_main.json' isDecExist={true} />
            </td>
            <td>
              <ResourceLink basePath={group.mainRes.path} file='patch.json' isDecExist={false} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
const PlatformAccordion = ({
  region,
  channel,
  platformData,
}: {
  region: string;
  channel: number;
  platformData: PlatformData;
}) => {
  const itemId = `res-${region}-${channel}-${platformData.platform}`;

  return (
    <div className='accordion-item'>
      <h2 className='accordion-header' id={`heading-${itemId}`}>
        <button
          className='accordion-button collapsed'
          type='button'
          data-bs-toggle='collapse'
          data-bs-target={`#collapse-${itemId}`}
          aria-expanded='false'
          aria-controls={`collapse-${itemId}`}
        >
          {platformData.platform}
        </button>
      </h2>
      <div
        id={`collapse-${itemId}`}
        className='accordion-collapse collapse'
        aria-labelledby={`heading-${itemId}`}
        data-bs-parent={`#accordion-res-${region}-${channel}`}
      >
        <div className='accordion-body'>
          <ResourceTable groups={platformData.groups} />
        </div>
      </div>
    </div>
  );
};

export default function ResourcesTab() {
  const { data, loading } = useResourcesData();

  useEffect(() => {
    if (!loading) {
      const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
      const tooltipList = Array.from(tooltipTriggerList).map((el) => new Tooltip(el));
      return () => {
        for (const t of tooltipList) {
          t.dispose();
        }
      };
    }
  }, [loading]);

  if (loading) {
    return (
      <div className='text-center p-5'>
        <div className='spinner-border' role='status'></div>
      </div>
    );
  }

  return (
    <div>
      {data.map((regionData) => (
        <div key={`${regionData.region}-${regionData.channel}`} className='mb-5'>
          <h3 className='mb-3'>{TARGETS.find((t) => t.region === regionData.region)?.label || regionData.region}</h3>
          <div className='accordion' id={`accordion-res-${regionData.region}-${regionData.channel}`}>
            {regionData.platforms.map((plat) => (
              <PlatformAccordion
                key={plat.platform}
                region={regionData.region}
                channel={regionData.channel}
                platformData={plat}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
