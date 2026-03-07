import { DateTime } from 'luxon';
import { fetchJson } from '../../api.js';
import type { LauncherWebBanner, StoredData } from '../../types.js';
import { BASE_URL, gameTargets, launcherWebApiLang } from '../../utils/constants.js';

export async function renderBanner(container: HTMLElement) {
  const outerCard = document.createElement('div');
  outerCard.className = 'card mb-3';

  const header = document.createElement('div');
  header.className = 'card-header d-flex justify-content-between align-items-center';
  header.style.cursor = 'pointer';
  header.setAttribute('data-bs-toggle', 'collapse');
  header.setAttribute('data-bs-target', '#collapseBanner');
  header.setAttribute('role', 'button');
  header.innerHTML = '<h3 class="h4 mb-0">Banner</h3><i class="bi bi-chevron-down"></i>';
  outerCard.appendChild(header);

  const collapseDiv = document.createElement('div');
  collapseDiv.id = 'collapseBanner';
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

    contentDiv.innerHTML = '<div class="text-muted p-2">Loading banners...</div>';

    const url = `${BASE_URL}/akEndfield/launcher/web/${target.dirName}/banner/${lang}/all.json`;
    try {
      const data = await fetchJson<StoredData<LauncherWebBanner>[]>(url);
      if (!data || data.length === 0) {
        contentDiv.innerHTML = '<div class="text-muted p-2">No data found.</div>';
        return;
      }

      // Collect unique banners by ID from the entire history
      const bannerMap = new Map<string, { banner: LauncherWebBanner['banners'][0]; firstSeen: string }>();
      const sortedData = [...data].sort(
        (a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis(),
      );

      for (const entry of sortedData) {
        if (!entry.rsp || !entry.rsp.banners) continue;
        for (const banner of entry.rsp.banners) {
          if (!bannerMap.has(banner.id)) {
            bannerMap.set(banner.id, { banner, firstSeen: entry.updatedAt });
          }
        }
      }

      contentDiv.innerHTML = '';
      if (bannerMap.size === 0) {
        contentDiv.innerHTML = '<div class="text-muted p-2">No banners found.</div>';
        return;
      }

      const row = document.createElement('div');
      row.className = 'row row-cols-1 row-cols-md-3 row-cols-lg-4 g-3';
      contentDiv.appendChild(row);

      for (const [id, { banner, firstSeen }] of bannerMap) {
        const col = document.createElement('div');
        col.className = 'col';

        const dateStr = DateTime.fromISO(firstSeen).toFormat('yyyy/MM/dd HH:mm');
        const mirrorUrl = getMirrorUrl(banner.url);
        const linkUrl = banner.jump_url || mirrorUrl;

        col.innerHTML = `
          <a href="${linkUrl}" target="_blank" class="text-decoration-none text-reset">
            <div class="card h-100 shadow-sm border-0">
              <div class="position-relative">
                <img src="${mirrorUrl}" class="card-img-top rounded" alt="Banner Image" style="object-fit: cover; aspect-ratio: 16 / 9;">
                <div class="position-absolute top-0 end-0 p-1">
                  ${banner.need_token ? '<span class="badge bg-warning text-dark" style="font-size: 0.6rem;">Auth</span>' : ''}
                </div>
              </div>
              <div class="card-body py-1 px-1">
                <div class="d-flex justify-content-between align-items-center" style="font-size: 0.7rem;">
                  <span class="text-muted text-truncate me-1">ID: ${id}</span>
                  <span class="text-muted flex-shrink-0">${dateStr}</span>
                </div>
              </div>
            </div>
          </a>
        `;
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
