// import * as bootstrap from 'bootstrap';
import ky from 'ky';
import { DateTime } from 'luxon';
import * as semver from 'semver';
import math from './utils/math.js';

document.addEventListener('DOMContentLoaded', () => {
  main();
});

const BASE_URL = 'https://raw.githubusercontent.com/daydreamer-json/ak-endfield-api-archive/refs/heads/main/output';

const FILE_SIZE_OPTS = {
  decimals: 2,
  decimalPadding: true,
  useBinaryUnit: true,
  useBitUnit: false,
  unitVisible: true,
  unit: null,
};

interface MirrorFileEntry {
  orig: string;
  mirror: string;
}

interface StoredData<T> {
  req: any;
  rsp: T;
  updatedAt: string;
}

const gameTargets = [
  { name: 'Official', region: 'os', dirName: '6', channel: 6 },
  { name: 'Epic', region: 'os', dirName: '801', channel: 6 },
  { name: 'Google Play', region: 'os', dirName: '802', channel: 6 },
  { name: 'Official', region: 'cn', dirName: '1', channel: 1 },
  { name: 'Bilibili', region: 'cn', dirName: '2', channel: 2 },
];

const launcherTargets = [
  { id: 'os', apps: ['EndField', 'Official'], channel: 6 },
  { id: 'cn', apps: ['EndField', 'Arknights', 'Official'], channel: 1 },
];

const apiCache = new Map<string, Promise<any>>();

function fetchJson<T>(url: string): Promise<T> {
  if (!apiCache.has(url)) {
    const promise = ky
      .get(url)
      .json<T>()
      .catch((err) => {
        apiCache.delete(url);
        throw err;
      });
    apiCache.set(url, promise);
  }
  return apiCache.get(url) as Promise<T>;
}

let mirrorFileDb: MirrorFileEntry[] = [];

async function preloadData() {
  const promises: Promise<any>[] = [];
  promises.push(fetchJson(`${BASE_URL}/mirror_file_list.json`));
  for (const target of gameTargets) {
    promises.push(fetchJson(`${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all.json`));
    promises.push(fetchJson(`${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all_patch.json`));
  }
  const resTargets = [
    { region: 'os', channel: 6 },
    { region: 'cn', channel: 1 },
  ];
  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'];
  for (const target of resTargets) {
    for (const platform of platforms) {
      promises.push(fetchJson(`${BASE_URL}/akEndfield/launcher/game_resources/${target.channel}/${platform}/all.json`));
    }
  }
  for (const region of launcherTargets) {
    for (const app of region.apps) {
      promises.push(fetchJson(`${BASE_URL}/akEndfield/launcher/launcher/${app}/${region.channel}/all.json`));
      promises.push(fetchJson(`${BASE_URL}/akEndfield/launcher/launcherExe/${app}/${region.channel}/all.json`));
    }
  }
  await Promise.all(promises);
}

async function main() {
  const contentDiv = document.getElementById('content');
  if (!contentDiv) return;

  await preloadData();

  try {
    mirrorFileDb = await fetchJson<MirrorFileEntry[]>(`${BASE_URL}/mirror_file_list.json`);
  } catch (e) {
    console.warn('Failed to fetch mirror list', e);
  }

  const tabsHtml = `
    <ul class="nav nav-tabs" id="mainTabs" role="tablist">
      <li class="nav-item" role="presentation"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#tab-overview" type="button">Overview</button></li>
      <li class="nav-item" role="presentation"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-game" type="button">Game Packages</button></li>
      <li class="nav-item" role="presentation"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-patch" type="button">Patches</button></li>
      <li class="nav-item" role="presentation"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-resources" type="button">Resources</button></li>
      <li class="nav-item" role="presentation"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-launcher" type="button">Launcher</button></li>
    </ul>
    <div class="tab-content p-3 border border-top-0 rounded-bottom" id="mainTabsContent">
      <div class="tab-pane fade show active" id="tab-overview" role="tabpanel"></div>
      <div class="tab-pane fade" id="tab-game" role="tabpanel"></div>
      <div class="tab-pane fade" id="tab-patch" role="tabpanel"></div>
      <div class="tab-pane fade" id="tab-resources" role="tabpanel"></div>
      <div class="tab-pane fade" id="tab-launcher" role="tabpanel"></div>
    </div>
  `;
  contentDiv.innerHTML = tabsHtml;

  await Promise.all([
    renderOverview(document.getElementById('tab-overview')!),
    renderGamePackages(document.getElementById('tab-game')!),
    renderPatches(document.getElementById('tab-patch')!),
    renderResources(document.getElementById('tab-resources')!),
    renderLaunchers(document.getElementById('tab-launcher')!),
  ]);
}

async function renderOverview(container: HTMLElement) {
  const mirrorOrigSet = new Set<string>();
  for (const m of mirrorFileDb) {
    try {
      const u = new URL(m.orig);
      u.search = '';
      mirrorOrigSet.add(u.toString());
    } catch {}
  }

  const countedUrls = new Set<string>();
  let totalMirrorSize = 0;

  const checkAndAddSize = (url: string, size: number) => {
    if (!url || isNaN(size)) return;
    try {
      const u = new URL(url);
      u.search = '';
      const cleanUrl = u.toString();
      if (countedUrls.has(cleanUrl)) return;
      if (mirrorOrigSet.has(cleanUrl)) {
        totalMirrorSize += size;
        countedUrls.add(cleanUrl);
      }
    } catch {}
  };

  const section = document.createElement('div');
  const sectionIn = document.createElement('div');
  section.className = 'card mb-3';
  sectionIn.className = 'card-body';
  sectionIn.innerHTML = `
    <h3 class="card-title">Latest Game Packages</h3>
    <p class="text-center lh-1">
      <span class="fw-bold fs-1">${await (
        async () => {
          const url = `${BASE_URL}/akEndfield/launcher/game/6/all.json`;
          const dat = await fetchJson<StoredData<any>[]>(url);
          return dat.at(-1)?.rsp.version;
        }
      )()}</span><br />
      Latest Version (Global)
    </p>
  `;

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-responsive';

  const table = document.createElement('table');
  table.className = 'table table-striped table-bordered table-sm align-middle text-nowrap';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Region</th>
        <th>Channel</th>
        <th>Version</th>
        <th class="text-end">Packed</th>
        <th class="text-end">Unpacked</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody')!;
  tableWrapper.appendChild(table);
  sectionIn.appendChild(tableWrapper);
  section.appendChild(sectionIn);
  container.appendChild(section);

  // 1. Game Packages
  for (const target of gameTargets) {
    const url = `${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all.json`;
    try {
      const data = await fetchJson<StoredData<any>[]>(url);
      if (!data || data.length === 0) continue;

      const latest = data[data.length - 1];
      if (!latest) continue;
      const version = latest.rsp.version;
      const packedSize = math.arrayTotal(latest.rsp.pkg.packs.map((f: any) => parseInt(f.package_size)));
      const totalSize = parseInt(latest.rsp.pkg.total_size);
      const unpackedSize = totalSize - packedSize;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${target.region === 'cn' ? 'China' : 'Global'}</td>
        <td>${target.name}</td>
        <td>${version}</td>
        <td class="text-end">${math.formatFileSize(packedSize, FILE_SIZE_OPTS)}</td>
        <td class="text-end">${math.formatFileSize(unpackedSize, FILE_SIZE_OPTS)}</td>
      `;
      tbody.appendChild(row);

      for (const entry of data) {
        if (entry.rsp.pkg && entry.rsp.pkg.packs) {
          for (const pack of entry.rsp.pkg.packs) {
            checkAndAddSize(pack.url, parseInt(pack.package_size));
          }
        }
      }
    } catch (e) {
      console.warn('Overview: Failed to fetch game data', target.name, e);
    }
  }

  // 2. Patches
  for (const target of gameTargets) {
    const url = `${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all_patch.json`;
    try {
      const data = await fetchJson<StoredData<any>[]>(url);
      for (const entry of data) {
        if (!entry.rsp.patch) continue;
        if (entry.rsp.patch.url) {
          checkAndAddSize(entry.rsp.patch.url, parseInt(entry.rsp.patch.package_size));
        }
        if (entry.rsp.patch.patches) {
          for (const p of entry.rsp.patch.patches) {
            checkAndAddSize(p.url, parseInt(p.package_size));
          }
        }
      }
    } catch (e) {}
  }

  // 4. Launchers
  for (const region of launcherTargets) {
    for (const app of region.apps) {
      try {
        const urlZip = `${BASE_URL}/akEndfield/launcher/launcher/${app}/${region.channel}/all.json`;
        const dataZip = await fetchJson<StoredData<any>[]>(urlZip);
        for (const e of dataZip) {
          checkAndAddSize(e.rsp.zip_package_url, parseInt(e.rsp.package_size));
        }
      } catch (e) {}
      try {
        const urlExe = `${BASE_URL}/akEndfield/launcher/launcherExe/${app}/${region.channel}/all.json`;
        const dataExe = await fetchJson<StoredData<any>[]>(urlExe);
        for (const e of dataExe) {
          checkAndAddSize(e.rsp.exe_url, parseInt(e.rsp.exe_size));
        }
      } catch (e) {}
    }
  }

  const mirrorSection = document.createElement('div');
  mirrorSection.className = 'card';
  mirrorSection.innerHTML = `
    <div class="card-body">
      <h3 class="card-title">Mirror Statistics</h3>
      <p class="card-text text-center lh-1">
        <span class="fw-bold fs-1">${math.formatFileSize(totalMirrorSize, { ...FILE_SIZE_OPTS, unit: 'G' })}</span><br />
        uploaded to mirror
      </p>
    </div>
  `;
  container.appendChild(mirrorSection);
}

async function renderGamePackages(container: HTMLElement) {
  for (const target of gameTargets) {
    const url = `${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all.json`;
    try {
      const data = await fetchJson<StoredData<any>[]>(url);
      const section = document.createElement('div');
      section.className = 'mb-5';
      section.innerHTML = `<h3 class="mb-3">${target.region === 'cn' ? 'China' : 'Global'}, ${target.name}</h3>`;

      const accordion = document.createElement('div');
      accordion.className = 'accordion';
      accordion.id = `accordion-game-${target.dirName}`;

      // Reverse order to show latest first
      const list = [...data].reverse();
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e) continue;
        const version = e.rsp.version;
        const dateStr = DateTime.fromISO(e.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss');
        const packedSize = math.arrayTotal(e.rsp.pkg.packs.map((f: any) => parseInt(f.package_size)));
        const unpackedSize = parseInt(e.rsp.pkg.total_size) - packedSize;

        let rows = '';
        const fileName = (f: any) => new URL(f.url).pathname.split('/').pop() ?? '';
        for (const f of e.rsp.pkg.packs) {
          rows += `<tr>
            <td>${fileName(f)}</td>
            <td><code>${f.md5}</code></td>
            <td class="text-end">${math.formatFileSize(parseInt(f.package_size), FILE_SIZE_OPTS)}</td>
            <td class="text-center">${generateDownloadLinks(f.url)}</td>
          </tr>`;
        }

        const itemId = `game-${target.dirName}-${i}`;
        // const isExpanded = i === 0;
        const isExpanded = false;
        const item = document.createElement('div');
        item.className = 'accordion-item';
        item.innerHTML = `
          <h2 class="accordion-header" id="heading-${itemId}">
            <button class="accordion-button ${isExpanded ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${itemId}" aria-expanded="${isExpanded}" aria-controls="collapse-${itemId}">
              <div class="d-flex w-100 justify-content-between me-3">
                <span class="fw-bold">${version}</span>
                <span class="text-muted small align-bottom">${dateStr}</span>
              </div>
            </button>
          </h2>
          <div id="collapse-${itemId}" class="accordion-collapse collapse ${isExpanded ? 'show' : ''}" aria-labelledby="heading-${itemId}" data-bs-parent="#${accordion.id}">
            <div class="accordion-body">
              <table class="table table-sm table-borderless w-auto mb-2">
                <tr><td>Unpacked Size</td><td class="text-end fw-bold">${math.formatFileSize(unpackedSize, FILE_SIZE_OPTS)}</td></tr>
                <tr><td>Packed Size</td><td class="text-end fw-bold">${math.formatFileSize(packedSize, FILE_SIZE_OPTS)}</td></tr>
              </table>
              <div class="table-responsive">
                <table class="table table-striped table-bordered table-sm align-middle text-nowrap">
                  <thead><tr><th>File</th><th>MD5 Checksum</th><th class="text-end">Size</th><th class="text-center">DL</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
          </div>
        `;
        accordion.appendChild(item);
      }
      section.appendChild(accordion);
      container.appendChild(section);
    } catch (err) {
      // Ignore 404 or errors
    }
  }
}

async function renderPatches(container: HTMLElement) {
  for (const target of gameTargets) {
    const url = `${BASE_URL}/akEndfield/launcher/game/${target.dirName}/all_patch.json`;
    try {
      const data = await fetchJson<StoredData<any>[]>(url);
      if (data.length === 0) continue;

      const section = document.createElement('div');
      section.className = 'mb-5';
      section.innerHTML = `<h3 class="mb-3">${target.region === 'cn' ? 'China' : 'Global'}, ${target.name}</h3>`;

      const accordion = document.createElement('div');
      accordion.className = 'accordion';
      accordion.id = `accordion-patch-${target.dirName}`;

      let itemIndex = 0;
      for (const e of [...data].reverse()) {
        if (!e.rsp.patch) continue;
        const version = e.rsp.version;
        const reqVersion = e.rsp.request_version;
        const dateStr = DateTime.fromISO(e.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss');
        const packedSize = math.arrayTotal(e.rsp.patch.patches.map((f: any) => parseInt(f.package_size)));
        const unpackedSize = parseInt(e.rsp.patch.total_size) - packedSize;

        let rows = '';
        const fileName = (url: string) => new URL(url).pathname.split('/').pop() ?? '';
        if (e.rsp.patch.url) {
          rows += `<tr>
            <td>${fileName(e.rsp.patch.url)}</td>
            <td><code>${e.rsp.patch.md5}</code></td>
            <td class="text-end">${math.formatFileSize(parseInt(e.rsp.patch.package_size), FILE_SIZE_OPTS)}</td>
            <td class="text-center">${generateDownloadLinks(e.rsp.patch.url)}</td>
          </tr>`;
        }
        for (const f of e.rsp.patch.patches) {
          rows += `<tr>
            <td>${fileName(f.url)}</td>
            <td><code>${f.md5}</code></td>
            <td class="text-end">${math.formatFileSize(parseInt(f.package_size), FILE_SIZE_OPTS)}</td>
            <td class="text-center">${generateDownloadLinks(f.url)}</td>
          </tr>`;
        }

        const itemId = `patch-${target.dirName}-${itemIndex}`;
        // const isExpanded = itemIndex === 0;
        const isExpanded = false;
        itemIndex++;

        const item = document.createElement('div');
        item.className = 'accordion-item';
        item.innerHTML = `
          <h2 class="accordion-header" id="heading-${itemId}">
            <button class="accordion-button ${isExpanded ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${itemId}" aria-expanded="${isExpanded}" aria-controls="collapse-${itemId}">
              <div class="d-flex w-100 justify-content-between me-3">
                <span class="fw-bold">${reqVersion} → ${version}</span>
                <span class="text-muted small">${dateStr}</span>
              </div>
            </button>
          </h2>
          <div id="collapse-${itemId}" class="accordion-collapse collapse ${isExpanded ? 'show' : ''}" aria-labelledby="heading-${itemId}" data-bs-parent="#${accordion.id}">
            <div class="accordion-body">
              <table class="table table-sm table-borderless w-auto mb-2">
                <tr><td>Unpacked Size</td><td class="text-end fw-bold">${math.formatFileSize(unpackedSize, FILE_SIZE_OPTS)}</td></tr>
                <tr><td>Packed Size</td><td class="text-end fw-bold">${math.formatFileSize(packedSize, FILE_SIZE_OPTS)}</td></tr>
              </table>
              <div class="table-responsive">
                <table class="table table-striped table-bordered table-sm align-middle text-nowrap">
                  <thead><tr><th>File</th><th>MD5 Checksum</th><th class="text-end">Size</th><th class="text-center">DL</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
          </div>
        `;
        accordion.appendChild(item);
      }
      section.appendChild(accordion);
      container.appendChild(section);
    } catch (err) {
      // Ignore
    }
  }
}

async function renderResources(container: HTMLElement) {
  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'];
  // Filter unique channels (OS: 6, CN: 1), excluding Bilibili (2) as per archive.ts logic
  const targets = [
    { region: 'os', channel: 6 },
    { region: 'cn', channel: 1 },
  ];

  for (const target of targets) {
    const section = document.createElement('div');
    section.className = 'mb-5';
    section.innerHTML = `<h3 class="mb-3">${target.region === 'cn' ? 'China' : 'Global'}</h3>`;

    const accordion = document.createElement('div');
    accordion.className = 'accordion';
    accordion.id = `accordion-res-${target.region}-${target.channel}`;
    let itemIndex = 0;

    for (const platform of platforms) {
      const url = `${BASE_URL}/akEndfield/launcher/game_resources/${target.channel}/${platform}/all.json`;
      try {
        const data = await fetchJson<StoredData<any>[]>(url);

        // Group by res_version
        const resVersionMap = new Map<string, { rsp: StoredData<any>; versions: Set<string> }>();
        for (const e of data) {
          const resVer = e.rsp.res_version;
          if (!resVersionMap.has(resVer)) {
            resVersionMap.set(resVer, { rsp: e, versions: new Set() });
          }
          resVersionMap.get(resVer)!.versions.add(e.req.version);
        }

        const resVersionSet = Array.from(resVersionMap.values()).map((d) => ({
          resVersion: d.rsp.rsp.res_version,
          rsp: d.rsp,
          versions: Array.from(d.versions).sort(semver.rcompare),
        }));

        let rows = '';
        for (const item of resVersionSet.reverse()) {
          // Newest first
          const dateStr = DateTime.fromISO(item.rsp.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss');
          const initialRes = item.rsp.rsp.resources.find((e: any) => e.name === 'initial');
          const mainRes = item.rsp.rsp.resources.find((e: any) => e.name === 'main');
          const isKick = JSON.parse(item.rsp.rsp.configs).kick_flag === true;

          rows += `<tr>
            <td style="font-feature-settings: 'tnum'">${dateStr}</td>
            <td><a href="${initialRes.path}" target="_blank">${initialRes.version}</a></td>
            <td><a href="${mainRes.path}" target="_blank">${mainRes.version}</a></td>
            <td class="text-center">${isKick ? '✅' : ''}</td>
            <td>${item.versions.join(', ')}</td>
          </tr>`;
        }

        const itemId = `res-${target.region}-${target.channel}-${platform}`;
        // const isExpanded = itemIndex === 0;
        const isExpanded = false;
        itemIndex++;

        const item = document.createElement('div');
        item.className = 'accordion-item';
        item.innerHTML = `
          <h2 class="accordion-header" id="heading-${itemId}">
            <button class="accordion-button ${isExpanded ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${itemId}" aria-expanded="${isExpanded}" aria-controls="collapse-${itemId}">
              ${platform}
            </button>
          </h2>
          <div id="collapse-${itemId}" class="accordion-collapse collapse ${isExpanded ? 'show' : ''}" aria-labelledby="heading-${itemId}" data-bs-parent="#${accordion.id}">
            <div class="accordion-body">
              <div class="table-responsive">
                <table class="table table-striped table-bordered table-sm align-middle text-nowrap">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Initial</th>
                      <th>Main</th>
                      <th>Kick</th>
                      <th>Game version</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
          </div>
        `;
        accordion.appendChild(item);
      } catch (err) {
        // Ignore
      }
    }
    if (accordion.childElementCount > 0) {
      section.appendChild(accordion);
      container.appendChild(section);
    }
  }
}

async function renderLaunchers(container: HTMLElement) {
  for (const region of launcherTargets) {
    for (const app of region.apps) {
      const section = document.createElement('div');
      section.className = 'mb-5';
      section.innerHTML = `<h3 class="mb-3">${region.id.toUpperCase()} ${app}</h3>`;

      const accordion = document.createElement('div');
      accordion.className = 'accordion';
      accordion.id = `accordion-launcher-${region.id}-${app}`;
      let itemIndex = 0;

      // Zip
      try {
        const urlZip = `${BASE_URL}/akEndfield/launcher/launcher/${app}/${region.channel}/all.json`;
        const dataZip = await fetchJson<StoredData<any>[]>(urlZip);

        let rows = '';
        for (const e of [...dataZip].reverse()) {
          const dateStr = DateTime.fromISO(e.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss');
          const fileName = new URL(e.rsp.zip_package_url).pathname.split('/').pop() ?? '';
          const unpacked = parseInt(e.rsp.total_size) - parseInt(e.rsp.package_size);

          rows += `<tr>
            <td>${dateStr}</td>
            <td>${e.rsp.version}</td>
            <td>${fileName}</td>
            <td><code>${e.rsp.md5}</code></td>
            <td class="text-end">${math.formatFileSize(unpacked, FILE_SIZE_OPTS)}</td>
            <td class="text-end">${math.formatFileSize(parseInt(e.rsp.package_size), FILE_SIZE_OPTS)}</td>
            <td class="text-center">${generateDownloadLinks(e.rsp.zip_package_url)}</td>
          </tr>`;
        }

        const itemId = `launcher-zip-${region.id}-${app}`;
        // const isExpanded = itemIndex === 0;
        const isExpanded = false;
        itemIndex++;

        const item = document.createElement('div');
        item.className = 'accordion-item';
        item.innerHTML = `
          <h2 class="accordion-header" id="heading-${itemId}">
            <button class="accordion-button ${isExpanded ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${itemId}" aria-expanded="${isExpanded}" aria-controls="collapse-${itemId}">
              Launcher Packages (zip)
            </button>
          </h2>
          <div id="collapse-${itemId}" class="accordion-collapse collapse ${isExpanded ? 'show' : ''}" aria-labelledby="heading-${itemId}" data-bs-parent="#${accordion.id}">
            <div class="accordion-body">
              <div class="table-responsive">
                <table class="table table-striped table-bordered table-sm align-middle text-nowrap">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Version</th>
                      <th>File</th>
                      <th>MD5 Checksum</th>
                      <th class="text-end">Unpacked</th>
                      <th class="text-end">Packed</th>
                      <th class="text-center">DL</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
          </div>
        `;
        accordion.appendChild(item);
      } catch (e) {}

      // Exe
      try {
        const urlExe = `${BASE_URL}/akEndfield/launcher/launcherExe/${app}/${region.channel}/all.json`;
        const dataExe = await fetchJson<StoredData<any>[]>(urlExe);

        let rows = '';
        for (const e of [...dataExe].reverse()) {
          const dateStr = DateTime.fromISO(e.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss');
          const fileName = new URL(e.rsp.exe_url).pathname.split('/').pop() ?? '';

          rows += `<tr>
            <td>${dateStr}</td>
            <td>${e.rsp.version}</td>
            <td>${fileName}</td>
            <td class="text-end">${math.formatFileSize(parseInt(e.rsp.exe_size), FILE_SIZE_OPTS)}</td>
            <td class="text-center">${generateDownloadLinks(e.rsp.exe_url)}</td>
          </tr>`;
        }

        const itemId = `launcher-exe-${region.id}-${app}`;
        // const isExpanded = itemIndex === 0;
        const isExpanded = false;
        itemIndex++;

        const item = document.createElement('div');
        item.className = 'accordion-item';
        item.innerHTML = `
          <h2 class="accordion-header" id="heading-${itemId}">
            <button class="accordion-button ${isExpanded ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${itemId}" aria-expanded="${isExpanded}" aria-controls="collapse-${itemId}">
              Launcher Packages (Installer)
            </button>
          </h2>
          <div id="collapse-${itemId}" class="accordion-collapse collapse ${isExpanded ? 'show' : ''}" aria-labelledby="heading-${itemId}" data-bs-parent="#${accordion.id}">
            <div class="accordion-body">
              <div class="table-responsive">
                <table class="table table-striped table-bordered table-sm align-middle text-nowrap">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Version</th>
                      <th>File</th>
                      <th class="text-end">Size</th>
                      <th class="text-center">DL</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
          </div>
        `;
        accordion.appendChild(item);
      } catch (e) {}

      if (accordion.childElementCount > 0) {
        section.appendChild(accordion);
        container.appendChild(section);
      }
    }
  }
}

// --- Utils ---

function generateDownloadLinks(url: string) {
  const cleanUrl = new URL(url);
  cleanUrl.search = '';
  const mirrorEntry = mirrorFileDb.find((g) => g.orig.includes(cleanUrl.toString()));

  const links: string[] = [];
  links.push(`<a href="${url}" target="_blank">Orig</a>`);
  if (mirrorEntry) {
    links.push(`<a href="${mirrorEntry.mirror}" target="_blank">Mirror</a>`);
  }
  return links.join(' / ');
}
