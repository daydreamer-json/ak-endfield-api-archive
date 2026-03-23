import type { MirrorFileEntry } from '../types.js';

export function generateDownloadLinks(url: string, mirrorFileDb: MirrorFileEntry[]) {
  const cleanUrl = new URL(url);
  cleanUrl.search = '';
  const mirrorEntry = mirrorFileDb.find((g) => g.orig.includes(cleanUrl.toString()));

  const links: string[] = [];
  if (!mirrorEntry || mirrorEntry.origStatus === true) {
    links.push(`<a href="${url}" target="_blank">Orig</a>`);
  }
  if (mirrorEntry) {
    links.push(`<a href="${mirrorEntry.mirror}" target="_blank">Mirror</a>`);
  }
  return links.join(' / ');
}
