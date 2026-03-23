import { DateTime } from 'luxon';
import { fetchJson } from '../api.js';
import type { MirrorFileEntry, StoredData } from '../types.js';
import { BASE_URL, FILE_SIZE_OPTS, gameTargets } from '../utils/constants.js';
import math from '../utils/math.js';
import { generateDownloadLinks } from '../utils/ui.js';

export async function renderPatches(container: HTMLElement, mirrorFileDb: MirrorFileEntry[]) {
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
            <td class="text-center">${generateDownloadLinks(e.rsp.patch.url, mirrorFileDb)}</td>
          </tr>`;
        }
        for (const f of e.rsp.patch.patches) {
          rows += `<tr>
            <td>${fileName(f.url)}</td>
            <td><code>${f.md5}</code></td>
            <td class="text-end">${math.formatFileSize(parseInt(f.package_size), FILE_SIZE_OPTS)}</td>
            <td class="text-center">${generateDownloadLinks(f.url, mirrorFileDb)}</td>
          </tr>`;
        }

        const itemId = `patch-${target.dirName}-${itemIndex}`;
        const isExpanded = false;
        itemIndex++;

        const item = document.createElement('div');
        item.className = 'accordion-item';
        item.innerHTML = `
          <h2 class="accordion-header" id="heading-${itemId}">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${itemId}" aria-expanded="${isExpanded}" aria-controls="collapse-${itemId}">
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
