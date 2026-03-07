import { renderAnnouncement } from './webPretty/announcement.js';
import { renderBanner } from './webPretty/banner.js';
import { renderMainBgImage } from './webPretty/mainBgImage.js';
import { renderSidebar } from './webPretty/sidebar.js';
import { renderSingleEnt } from './webPretty/singleEnt.js';

export async function renderWebPretty(container: HTMLElement) {
  container.innerHTML = '';
  await renderAnnouncement(container);
  await renderBanner(container);
  await renderMainBgImage(container);
  await renderSingleEnt(container);
  await renderSidebar(container);
}
