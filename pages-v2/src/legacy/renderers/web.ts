import { DateTime } from 'luxon';
import { fetchJson } from '../api.js';
import type { StoredData } from '../types.js';
import { BASE_URL, gameTargets, launcherWebApiLang } from '../utils/constants.js';

const apiTypes = ['announcement', 'banner', 'main_bg_image', 'sidebar', 'single_ent'];

export async function renderWeb(container: HTMLElement) {
  for (const target of gameTargets) {
    const section = document.createElement('div');
    section.className = 'mb-5';
    section.innerHTML = `<h3 class="mb-3">${target.region === 'cn' ? 'China' : 'Global'}, ${target.name}</h3>`;

    const langs = launcherWebApiLang[target.region] || [];
    const defaultLang = target.region === 'os' ? 'en-us' : 'zh-cn';

    // Language Selector
    const langSelectGroup = document.createElement('div');
    langSelectGroup.className = 'input-group mb-3';
    langSelectGroup.innerHTML = '<span class="input-group-text">Language</span>';

    const langSelect = document.createElement('select');
    langSelect.className = 'form-select';

    langs.forEach((lang) => {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = lang;
      if (lang === defaultLang) {
        option.selected = true;
      }
      langSelect.appendChild(option);
    });
    langSelectGroup.appendChild(langSelect);

    if (langs.length <= 1) {
      langSelectGroup.style.display = 'none';
    }

    section.appendChild(langSelectGroup);

    const accordion = document.createElement('div');
    accordion.className = 'accordion';
    accordion.id = `accordion-web-${target.dirName}`;

    const renderApiList = async (lang: string) => {
      accordion.innerHTML = '<div class="text-muted p-2">Loading...</div>';

      const results = await Promise.all(
        apiTypes.map(async (apiType) => {
          const url = `${BASE_URL}/akEndfield/launcher/web/${target.dirName}/${apiType}/${lang}/all.json`;
          try {
            const data = await fetchJson<StoredData<any>[]>(url);
            if (!data || data.length === 0) return null;
            return { apiType, list: [...data].reverse() };
          } catch (e) {
            console.warn(`Failed to load ${url}`, e);
            return null;
          }
        }),
      );

      accordion.innerHTML = '';
      const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);

      if (validResults.length === 0) {
        accordion.innerHTML = '<div class="text-muted p-2">No data found.</div>';
        return;
      }

      validResults.forEach(({ apiType, list }, idx) => {
        const itemId = `web-${target.dirName}-${lang}-${apiType}`;

        const item = document.createElement('div');
        item.className = 'accordion-item';

        // Header
        const header = document.createElement('h2');
        header.className = 'accordion-header';
        header.id = `heading-${itemId}`;
        header.innerHTML = `
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${itemId}" aria-expanded="false" aria-controls="collapse-${itemId}">
              ${apiType}
            </button>
          `;
        item.appendChild(header);

        // Body
        const collapse = document.createElement('div');
        collapse.id = `collapse-${itemId}`;
        collapse.className = 'accordion-collapse collapse';
        collapse.setAttribute('aria-labelledby', `heading-${itemId}`);
        collapse.setAttribute('data-bs-parent', `#${accordion.id}`);

        const body = document.createElement('div');
        body.className = 'accordion-body';

        // Select for UpdatedAt
        const selectGroup = document.createElement('div');
        selectGroup.className = 'input-group mb-3';
        selectGroup.innerHTML = `<span class="input-group-text">History</span>`;

        const select = document.createElement('select');
        select.className = 'form-select';
        select.ariaLabel = 'Select version';

        list.forEach((entry, idx) => {
          const dateStr = DateTime.fromISO(entry.updatedAt).toFormat('yyyy/MM/dd HH:mm:ss');
          const option = document.createElement('option');
          option.value = idx.toString();
          option.textContent = `${dateStr}`;
          select.appendChild(option);
        });
        selectGroup.appendChild(select);
        body.appendChild(selectGroup);

        // Content Area
        const contentArea = document.createElement('pre');
        contentArea.className = 'p-3 border rounded overflow-auto';
        contentArea.style.maxHeight = '500px';
        contentArea.style.fontSize = '0.875rem';

        const updateContent = (index: number) => {
          const entry = list[index];
          if (entry) {
            contentArea.textContent = JSON.stringify(entry.rsp, null, 2);
          }
        };

        // Initial render for this item
        updateContent(0);

        select.addEventListener('change', (e) => {
          const val = parseInt((e.target as HTMLSelectElement).value, 10);
          updateContent(val);
        });

        body.appendChild(contentArea);
        collapse.appendChild(body);
        item.appendChild(collapse);
        accordion.appendChild(item);
      });
    };

    langSelect.addEventListener('change', (e) => {
      renderApiList((e.target as HTMLSelectElement).value);
    });

    section.appendChild(accordion);
    container.appendChild(section);

    // Initial load
    if (defaultLang) {
      renderApiList(defaultLang);
    }
  }
}
