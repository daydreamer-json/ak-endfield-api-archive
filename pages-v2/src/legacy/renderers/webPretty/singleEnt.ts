import { DateTime } from 'luxon';
import { fetchJson } from '../../api.js';
import type { LauncherWebSingleEnt, StoredData } from '../../types.js';
import { BASE_URL, gameTargets, launcherWebApiLang } from '../../utils/constants.js';

export async function renderSingleEnt(container: HTMLElement) {
  const outerCard = document.createElement('div');
  outerCard.className = 'card mb-3';

  const header = document.createElement('div');
  header.className = 'card-header d-flex justify-content-between align-items-center';
  header.style.cursor = 'pointer';
  header.setAttribute('data-bs-toggle', 'collapse');
  header.setAttribute('data-bs-target', '#collapseSingleEnt');
  header.setAttribute('role', 'button');
  header.innerHTML = '<h3 class="h4 mb-0">Single Ent.</h3><i class="bi bi-chevron-down"></i>';
  outerCard.appendChild(header);

  const collapseDiv = document.createElement('div');
  collapseDiv.id = 'collapseSingleEnt';
  collapseDiv.className = 'collapse';
  outerCard.appendChild(collapseDiv);

  const outerCardBody = document.createElement('div');
  outerCardBody.className = 'card-body';
  collapseDiv.appendChild(outerCardBody);

  // --- UI Controls ---
  const controls = document.createElement('div');
  controls.className = 'row g-3 mb-4';

  const targetCol = document.createElement('div');
  targetCol.className = 'col-md-6';
  targetCol.innerHTML = '<label class="form-label fw-bold">Target</label>';
  const targetSelect = document.createElement('select');
  targetSelect.className = 'form-select';
  gameTargets.forEach((target, idx) => {
    const option = document.createElement('option');
    option.value = idx.toString();
    option.textContent = `${target.region === 'cn' ? 'China' : 'Global'} - ${target.name}`;
    targetSelect.appendChild(option);
  });
  targetCol.appendChild(targetSelect);

  const langCol = document.createElement('div');
  langCol.className = 'col-md-6';
  langCol.innerHTML = '<label class="form-label fw-bold">Language</label>';
  const langSelect = document.createElement('select');
  langSelect.className = 'form-select';
  langCol.appendChild(langSelect);

  controls.appendChild(targetCol);
  controls.appendChild(langCol);
  outerCardBody.appendChild(controls);

  const contentDiv = document.createElement('div');
  outerCardBody.appendChild(contentDiv);

  // --- Logic ---
  const updateLanguages = () => {
    const targetIdx = parseInt(targetSelect.value, 10);
    const target = gameTargets[targetIdx]!;
    const langs = launcherWebApiLang[target.region] || [];
    const defaultLang = target.region === 'os' ? 'en-us' : 'zh-cn';

    langSelect.innerHTML = '';
    langs.forEach((lang) => {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = lang;
      if (lang === defaultLang) option.selected = true;
      langSelect.appendChild(option);
    });

    langCol.style.display = langs.length <= 1 ? 'none' : 'block';
  };

  const getMirrorUrl = (url: string) => {
    if (!url) return '';
    try {
      const u = new URL(url);
      return `https://raw.githubusercontent.com/daydreamer-json/ak-endfield-api-archive/refs/heads/main/output/raw/${u.hostname}${u.pathname}`;
    } catch {
      return url;
    }
  };

  const renderContent = async () => {
    const targetIdx = parseInt(targetSelect.value, 10);
    const target = gameTargets[targetIdx]!;
    const lang = langSelect.value;

    if (!lang) {
      contentDiv.innerHTML = '<div class="text-muted p-2">No language selected.</div>';
      return;
    }

    contentDiv.innerHTML = '<div class="text-muted p-2">Loading single entry data...</div>';

    const url = `${BASE_URL}/akEndfield/launcher/web/${target.dirName}/single_ent/${lang}/all.json`;
    try {
      const data = await fetchJson<StoredData<LauncherWebSingleEnt>[]>(url);
      if (!data || data.length === 0) {
        contentDiv.innerHTML = '<div class="text-muted p-2">No data found.</div>';
        return;
      }

      // Collect unique visuals by MD5 from the entire history
      const entMap = new Map<string, { ent: LauncherWebSingleEnt['single_ent']; firstSeen: string }>();
      const sortedData = [...data].sort(
        (a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis(),
      );

      for (const entry of sortedData) {
        if (!entry.rsp || !entry.rsp.single_ent) continue;
        const ent = entry.rsp.single_ent;
        const key = ent.version_md5 || ent.version_url;
        if (!entMap.has(key)) {
          entMap.set(key, { ent, firstSeen: entry.updatedAt });
        }
      }

      contentDiv.innerHTML = '';
      if (entMap.size === 0) {
        contentDiv.innerHTML = '<div class="text-muted p-2">No data found.</div>';
        return;
      }

      const row = document.createElement('div');
      row.className = 'row row-cols-1 row-cols-md-2 g-4';
      contentDiv.appendChild(row);

      for (const [_key, { ent, firstSeen }] of entMap) {
        const col = document.createElement('div');
        col.className = 'col';

        const card = document.createElement('div');
        card.className = 'card h-100 shadow-sm';

        let innerHtml = `
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <span class="text-muted small">First seen: ${DateTime.fromISO(firstSeen).toFormat('yyyy/MM/dd HH:mm')}</span>
              ${ent.need_token ? '<span class="badge bg-warning text-dark">Auth</span>' : ''}
            </div>
            <div class="mb-3">
              <label class="form-label small fw-bold">Version Image</label>
              <a href="${getMirrorUrl(ent.version_url)}" target="_blank">
                <img src="${getMirrorUrl(ent.version_url)}" class="img-fluid rounded border" alt="Version Image">
              </a>
              <p class="text-muted font-monospace mt-1" style="font-size: 0.7rem; word-break: break-all;">MD5: ${ent.version_md5}</p>
            </div>
        `;

        if (ent.button_url) {
          innerHtml += `
            <div class="mb-3">
              <label class="form-label small fw-bold">Action Button</label>
              <div class="d-flex gap-2">
                <div class="flex-grow-1">
                  <img src="${getMirrorUrl(ent.button_url)}" class="img-fluid rounded border bg-light" alt="Button" style="max-height: 60px;">
                  <p class="text-muted small mt-1 mb-0">Normal</p>
                </div>
                ${
                  ent.button_hover_url
                    ? `
                <div class="flex-grow-1">
                  <img src="${getMirrorUrl(ent.button_hover_url)}" class="img-fluid rounded border bg-light" alt="Button Hover" style="max-height: 60px;">
                  <p class="text-muted small mt-1 mb-0">Hover</p>
                </div>
                `
                    : ''
                }
              </div>
            </div>
          `;
        }

        if (ent.jump_url) {
          innerHtml += `
            <a href="${ent.jump_url}" target="_blank" class="btn btn-sm btn-outline-primary w-100">Jump URL</a>
          `;
        }

        innerHtml += '</div>';
        card.innerHTML = innerHtml;
        col.appendChild(card);
        row.appendChild(col);
      }
    } catch (e) {
      console.warn(`Failed to load ${url}`, e);
      contentDiv.innerHTML = '<div class="text-danger p-2">Failed to load data.</div>';
    }
  };

  targetSelect.addEventListener('change', () => {
    updateLanguages();
    renderContent();
  });
  langSelect.addEventListener('change', renderContent);

  updateLanguages();
  renderContent();
  container.appendChild(outerCard);
}
