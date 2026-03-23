import { fetchJson, preloadData } from './api.js';
import { renderGamePackages } from './renderers/gamePackages.js';
import { renderLaunchers } from './renderers/launchers.js';
import { renderOverview } from './renderers/overview.js';
import { renderPatches } from './renderers/patches.js';
import { renderResources } from './renderers/resources.js';
import { renderWebPretty } from './renderers/webPretty.js';
import type { MirrorFileEntry } from './types.js';
import { BASE_URL } from './utils/constants.js';

document.addEventListener('DOMContentLoaded', () => {
  main();
});

let mirrorFileDb: MirrorFileEntry[] = [];

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
      <li class="nav-item" role="presentation"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tab-web-pretty" type="button">Web</button></li>
    </ul>
    <div class="tab-content p-3 border border-top-0 rounded-bottom" id="mainTabsContent">
      <div class="tab-pane fade show active" id="tab-overview" role="tabpanel"></div>
      <div class="tab-pane fade" id="tab-game" role="tabpanel"></div>
      <div class="tab-pane fade" id="tab-patch" role="tabpanel"></div>
      <div class="tab-pane fade" id="tab-resources" role="tabpanel"></div>
      <div class="tab-pane fade" id="tab-launcher" role="tabpanel"></div>
      <div class="tab-pane fade" id="tab-web-pretty" role="tabpanel"></div>
    </div>
  `;
  contentDiv.innerHTML = tabsHtml;

  await Promise.all([
    renderOverview(document.getElementById('tab-overview')!, mirrorFileDb),
    renderGamePackages(document.getElementById('tab-game')!, mirrorFileDb),
    renderPatches(document.getElementById('tab-patch')!, mirrorFileDb),
    renderResources(document.getElementById('tab-resources')!),
    renderLaunchers(document.getElementById('tab-launcher')!, mirrorFileDb),
    renderWebPretty(document.getElementById('tab-web-pretty')!),
  ]);
}
