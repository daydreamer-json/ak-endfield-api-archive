import { DateTime } from 'luxon';
import { fetchJson } from '../api.js';
import type { MirrorFileEntry, StoredData } from '../types.js';
import { BASE_URL, FILE_SIZE_OPTS, launcherTargets } from '../utils/constants.js';
import math from '../utils/math.js';
import { generateDownloadLinks } from '../utils/ui.js';

export async function renderLaunchers(container: HTMLElement, mirrorFileDb: MirrorFileEntry[]) {
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
            <td class="text-center">${generateDownloadLinks(e.rsp.zip_package_url, mirrorFileDb)}</td>
          </tr>`;
        }

        const itemId = `launcher-zip-${region.id}-${app}`;
        const isExpanded = false;
        itemIndex++;

        const item = document.createElement('div');
        item.className = 'accordion-item';
        item.innerHTML = `
          <h2 class="accordion-header" id="heading-${itemId}">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${itemId}" aria-expanded="${isExpanded}" aria-controls="collapse-${itemId}">
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
            <td class="text-center">${generateDownloadLinks(e.rsp.exe_url, mirrorFileDb)}</td>
          </tr>`;
        }

        const itemId = `launcher-exe-${region.id}-${app}`;
        const isExpanded = false;
        itemIndex++;

        const item = document.createElement('div');
        item.className = 'accordion-item';
        item.innerHTML = `
          <h2 class="accordion-header" id="heading-${itemId}">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${itemId}" aria-expanded="${isExpanded}" aria-controls="collapse-${itemId}">
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
