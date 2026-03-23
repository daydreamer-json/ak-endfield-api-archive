import { DateTime } from 'luxon';
import * as semver from 'semver';
import { fetchJson } from '../api.js';
import type { StoredData } from '../types.js';
import { BASE_URL } from '../utils/constants.js';

export async function renderResources(container: HTMLElement) {
  const platforms = ['Windows', 'Android', 'iOS', 'PlayStation'];
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

        const sortedSet = resVersionSet.reverse();
        let rows = '';
        for (let i = 0; i < sortedSet.length; i++) {
          const item = sortedSet[i]!;
          const nextItem = sortedSet[i + 1];
          // Newest first
          const currentDate = DateTime.fromISO(item.rsp.updatedAt);
          const dateStr = currentDate.toFormat('yyyy/MM/dd HH:mm:ss');

          const intervalStr = (() => {
            if (nextItem) {
              const nextDate = DateTime.fromISO(nextItem.rsp.updatedAt);
              const diff = currentDate.diff(nextDate);
              return diff.toFormat('dd:hh:mm:ss');
            }
            return '-';
          })();

          const initialRes = item.rsp.rsp.resources.find((e: any) => e.name === 'initial');
          const mainRes = item.rsp.rsp.resources.find((e: any) => e.name === 'main');
          const isKick = JSON.parse(item.rsp.rsp.configs).kick_flag === true;

          rows += `<tr>
            <td style="font-feature-settings: 'tnum'">${dateStr}</td>
            <td style="font-feature-settings: 'tnum'">${intervalStr}</td>
            <td><a href="${initialRes.path}" target="_blank">${initialRes.version}</a></td>
            <td><a href="${mainRes.path}" target="_blank">${mainRes.version}</a></td>
            <td class="text-center">${isKick ? '✅' : ''}</td>
            <td>${item.versions.join(', ')}</td>
          </tr>`;
        }

        const itemId = `res-${target.region}-${target.channel}-${platform}`;
        const isExpanded = false;
        itemIndex++;

        const item = document.createElement('div');
        item.className = 'accordion-item';
        item.innerHTML = `
          <h2 class="accordion-header" id="heading-${itemId}">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${itemId}" aria-expanded="${isExpanded}" aria-controls="collapse-${itemId}">
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
                      <th>Interval</th>
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
