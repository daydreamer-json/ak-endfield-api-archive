import { DateTime } from 'luxon';
import { fetchJson } from '../api.js';
import type { MirrorFileEntry, StoredData } from '../types.js';
import { BASE_URL, FILE_SIZE_OPTS, gameTargets, launcherTargets } from '../utils/constants.js';
import math from '../utils/math.js';

export async function renderOverview(container: HTMLElement, mirrorFileDb: MirrorFileEntry[]) {
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

  const [globalPkg, chinaPkg] = await Promise.all([
    (async () => {
      const url = `${BASE_URL}/akEndfield/launcher/game/6/all.json`;
      const dat = await fetchJson<StoredData<any>[]>(url);
      const latest = dat.at(-1);
      if (!latest) return { version: '---', date: '---' };
      return {
        version: latest.rsp.version,
        date: DateTime.fromISO(latest.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss'),
      };
    })(),
    (async () => {
      const url = `${BASE_URL}/akEndfield/launcher/game/1/all.json`;
      const dat = await fetchJson<StoredData<any>[]>(url);
      const latest = dat.at(-1);
      if (!latest) return { version: '---', date: '---' };
      return {
        version: latest.rsp.version,
        date: DateTime.fromISO(latest.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss'),
      };
    })(),
  ]);

  sectionIn.innerHTML = `
    <h3 class="card-title mb-4">Latest Game Packages</h3>
    <div class="row text-center mb-4">
      <div class="col-md-6 mb-md-0 mb-3">
        <p class="lh-1 mb-0">
          <span class="fw-bold fs-1">${globalPkg.version}</span><br />
          <span class="small opacity-75" style="line-height: 1.5;">${globalPkg.date}</span><br />
          Latest Version (Global)
        </p>
      </div>
      <div class="col-md-6">
        <p class="lh-1 mb-0">
          <span class="fw-bold fs-1">${chinaPkg.version}</span><br />
          <span class="small opacity-75" style="line-height: 1.5;">${chinaPkg.date}</span><br />
          Latest Version (China)
        </p>
      </div>
    </div>
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

  // 3. Latest Game Resources (Global)
  {
    const resPlatforms = ['Windows', 'Android', 'iOS', 'PlayStation'];
    const resData = await Promise.all(
      resPlatforms.map(async (p) => {
        try {
          const url = `${BASE_URL}/akEndfield/launcher/game_resources/6/${p}/all.json`;
          const dat = await fetchJson<StoredData<any>[]>(url);
          return dat.at(-1);
        } catch {
          return undefined;
        }
      }),
    );

    const resSection = document.createElement('div');
    resSection.className = 'card mb-3';
    const resSectionIn = document.createElement('div');
    resSectionIn.className = 'card-body';
    resSectionIn.innerHTML = `
    <h3 class="card-title mb-4">Latest Game Resources</h3>
    <div class="row text-center">
      ${resPlatforms
        .map((p, i) => {
          const item = resData[i];
          if (!item) {
            return `
              <div class="col-md-3 mb-3 mb-md-0">
                <p class="lh-1 mb-0">
                  <span class="fw-bold fs-1">---</span><br />
                  ${p}
                </p>
              </div>
            `;
          }

          const version = (() => {
            const initialRes = item.rsp.resources.find((e: any) => e.name === 'initial');
            const mainRes = item.rsp.resources.find((e: any) => e.name === 'main');
            if (!initialRes || !mainRes) return '---';
            if (initialRes.version === mainRes.version) return mainRes.version;
            return item.rsp.res_version;
          })();

          const dateStr = DateTime.fromISO(item.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss');

          return `
            <div class="col-md-3 mb-3 mb-md-0">
              <p class="lh-1 mb-0">
                <span class="fw-bold fs-1">${version}</span><br />
                <span class="small opacity-75" style="line-height: 1.5;">${dateStr}</span><br />
                ${p}
              </p>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
    resSection.appendChild(resSectionIn);
    container.appendChild(resSection);
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
