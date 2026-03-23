import { DateTime } from 'luxon';
import { fetchJson } from '../../api.js';
import type { LauncherWebSidebar, StoredData } from '../../types.js';
import { BASE_URL, gameTargets, launcherWebApiLang } from '../../utils/constants.js';

export async function renderSidebar(container: HTMLElement) {
  const outerCard = document.createElement('div');
  outerCard.className = 'card mb-3';

  const header = document.createElement('div');
  header.className = 'card-header d-flex justify-content-between align-items-center';
  header.style.cursor = 'pointer';
  header.setAttribute('data-bs-toggle', 'collapse');
  header.setAttribute('data-bs-target', '#collapseSidebar');
  header.setAttribute('role', 'button');
  header.innerHTML = '<h3 class="h4 mb-0">Sidebar</h3><i class="bi bi-chevron-down"></i>';
  outerCard.appendChild(header);

  const collapseDiv = document.createElement('div');
  collapseDiv.id = 'collapseSidebar';
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

    contentDiv.innerHTML = '<div class="text-muted p-2">Loading sidebar data...</div>';

    const url = `${BASE_URL}/akEndfield/launcher/web/${target.dirName}/sidebar/${lang}/all.json`;
    try {
      const data = await fetchJson<StoredData<LauncherWebSidebar>[]>(url);
      if (!data || data.length === 0) {
        contentDiv.innerHTML = '<div class="text-muted p-2">No data found.</div>';
        return;
      }

      // Collect the latest sidebar configuration
      const sortedData = [...data].sort(
        (a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis(),
      );

      // We only show the latest version as sidebars are usually state-dependent
      const latest = sortedData[0];
      if (!latest || !latest.rsp || !latest.rsp.sidebars) {
        contentDiv.innerHTML = '<div class="text-muted p-2">No active sidebars.</div>';
        return;
      }

      contentDiv.innerHTML = '';
      const row = document.createElement('div');
      row.className = 'row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3';
      contentDiv.appendChild(row);

      for (const item of latest.rsp.sidebars) {
        const col = document.createElement('div');
        col.className = 'col';

        const card = document.createElement('div');
        card.className = 'card h-100 shadow-sm';

        let innerHtml = `
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h5 class="card-title mb-0">${item.media}</h5>
              ${item.need_token ? '<span class="badge bg-warning text-dark lh-1 py-1">Auth</span>' : ''}
            </div>
        `;

        if (item.pic) {
          innerHtml += `
            <div class="mb-3">
              <img src="${getMirrorUrl(item.pic.url)}" class="img-fluid rounded" alt="${item.pic.description}">
              <p class="text-muted small mt-1 mb-0">${item.pic.description}</p>
            </div>
          `;
        }

        if (item.jump_url) {
          innerHtml += `
            <a href="${item.jump_url}" target="_blank" class="btn btn-sm btn-outline-primary mb-2 w-100">Open Link</a>
          `;
        }

        if (item.sidebar_labels && item.sidebar_labels.length > 0) {
          innerHtml += '<div class="list-group list-group-flush border-top mt-2">';
          for (const label of item.sidebar_labels) {
            innerHtml += `
              <a href="${label.jump_url}" target="_blank" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2">
                <span style="font-size: 0.9rem;">${label.content}</span>
                <div class="d-flex gap-1">
                  ${label.need_token ? '<span class="badge bg-warning text-dark lh-1 py-1">Auth</span>' : ''}
                  <i class="bi bi-box-arrow-up-right small text-muted"></i>
                </div>
              </a>
            `;
          }
          innerHtml += '</div>';
        }

        innerHtml += '</div>';
        card.innerHTML = innerHtml;
        col.appendChild(card);
        row.appendChild(col);
      }

      const infoDiv = document.createElement('div');
      infoDiv.className = 'text-muted small mt-3 text-end';
      infoDiv.textContent = `Last updated: ${DateTime.fromISO(latest.updatedAt).toFormat('yyyy/MM/dd HH:mm')}`;
      contentDiv.appendChild(infoDiv);
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
