import { DateTime } from 'luxon';
import { fetchJson } from '../../api.js';
import type { LauncherWebAnnouncement, StoredData } from '../../types.js';
import { BASE_URL, gameTargets, launcherWebApiLang } from '../../utils/constants.js';

export async function renderAnnouncement(container: HTMLElement) {
  const outerCard = document.createElement('div');
  outerCard.className = 'card mb-3';

  const header = document.createElement('div');
  header.className = 'card-header d-flex justify-content-between align-items-center';
  header.style.cursor = 'pointer';
  header.setAttribute('data-bs-toggle', 'collapse');
  header.setAttribute('data-bs-target', '#collapseAnnouncement');
  header.setAttribute('role', 'button');
  header.innerHTML = '<h3 class="h4 mb-0">Announcement</h3><i class="bi bi-chevron-down"></i>';
  outerCard.appendChild(header);

  const collapseDiv = document.createElement('div');
  collapseDiv.id = 'collapseAnnouncement';
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

  const renderContent = async () => {
    const targetIdx = parseInt(targetSelect.value, 10);
    const target = gameTargets[targetIdx]!;
    const lang = langSelect.value;

    if (!lang) {
      contentDiv.innerHTML = '<div class="text-muted p-2">No language selected.</div>';
      return;
    }

    contentDiv.innerHTML = '<div class="text-muted p-2">Loading announcements...</div>';

    const url = `${BASE_URL}/akEndfield/launcher/web/${target.dirName}/announcement/${lang}/all.json`;
    try {
      const data = await fetchJson<StoredData<LauncherWebAnnouncement>[]>(url);
      if (!data || data.length === 0) {
        contentDiv.innerHTML = '<div class="text-muted p-2">No data found.</div>';
        return;
      }

      const tabsMap = new Map<
        string,
        { tabName: string; announcements: Map<string, LauncherWebAnnouncement['tabs'][0]['announcements'][0]> }
      >();
      const sortedData = [...data].sort(
        (a, b) => DateTime.fromISO(b.updatedAt).toMillis() - DateTime.fromISO(a.updatedAt).toMillis(),
      );

      for (const entry of sortedData) {
        if (!entry.rsp || !entry.rsp.tabs) continue;
        for (const tab of entry.rsp.tabs) {
          if (!tabsMap.has(tab.tab_id)) {
            tabsMap.set(tab.tab_id, { tabName: tab.tabName, announcements: new Map() });
          }
          const targetTab = tabsMap.get(tab.tab_id)!;
          for (const ann of tab.announcements) {
            if (!targetTab.announcements.has(ann.id)) {
              targetTab.announcements.set(ann.id, ann);
            }
          }
        }
      }

      contentDiv.innerHTML = '';
      if (tabsMap.size === 0) {
        contentDiv.innerHTML = '<div class="text-muted p-2">No announcements found.</div>';
        return;
      }

      for (const [_tabId, tabData] of tabsMap) {
        const card = document.createElement('div');
        card.className = 'card mb-4 shadow-sm';

        const cardHeader = document.createElement('div');
        cardHeader.className = 'card-header bg-secondary text-white fw-bold py-1';
        cardHeader.textContent = tabData.tabName;
        card.appendChild(cardHeader);

        const listGroup = document.createElement('ul');
        listGroup.className = 'list-group list-group-flush';

        const sortedAnnouncements = Array.from(tabData.announcements.values()).sort(
          (a, b) => parseInt(b.start_ts, 10) - parseInt(a.start_ts, 10),
        );

        for (const ann of sortedAnnouncements) {
          const item = document.createElement('li');
          item.className = 'list-group-item py-2';
          const date = DateTime.fromMillis(parseInt(ann.start_ts, 10)).toFormat('yyyy/MM/dd HH:mm');

          item.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-2">
              <span class="text-muted small" style="min-width: 120px;">${date}</span>
              <span class="flex-grow-1 fw-bold">${ann.content}</span>
              <div class="d-flex align-items-center gap-2">
                ${ann.need_token ? '<span class="badge bg-warning text-dark px-1 py-0" style="font-size: 0.7rem;">Auth</span>' : ''}
                ${ann.jump_url ? `<a href="${ann.jump_url}" target="_blank" class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size: 0.75rem;">Link</a>` : ''}
                <span class="text-muted border-start ps-2" style="font-size: 0.7rem;">ID:${ann.id}</span>
              </div>
            </div>
          `;
          listGroup.appendChild(item);
        }
        card.appendChild(listGroup);
        contentDiv.appendChild(card);
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
