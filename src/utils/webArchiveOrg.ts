import path from 'node:path';
import { HTTPError } from 'ky';
import api from './api/index.js';
import argvUtils from './argv.js';
import logger from './logger.js';
import mathUtils from './math.js';

function formatBytes(bytes: number) {
  return mathUtils.formatFileSize(bytes, {
    decimals: 2,
    decimalPadding: true,
    useBinaryUnit: true,
    useBitUnit: false,
    unitVisible: true,
    unit: null,
  });
}

async function login(username: string, password: string): Promise<{ user: string; sig: string }> {
  const token = await api.webArchiveOrg.login.getLoginToken();
  const loginRet = await api.webArchiveOrg.login.login(username, password, token, true);
  const credential = {
    user: loginRet.find((e) => e.name === 'logged-in-user')?.value,
    sig: loginRet.find((e) => e.name === 'logged-in-sig')?.value,
  };
  if (credential.sig && credential.user) return credential as { user: string; sig: string };
  throw new Error('Wayback Machine auth error');
}

async function savePage(url: string, auth: { user: string; sig: string }): Promise<string> {
  const jobId = await api.webArchiveOrg.save(url, auth);
  const result = await (async () => {
    while (true) {
      try {
        const status = await api.webArchiveOrg.saveStatus(jobId, auth);
        if (status.download_size && status.total_size)
          logger.debug(
            `Wayback Machine save: ${formatBytes(status.download_size)} / ${formatBytes(status.total_size)}`,
          );
        if (status.status === 'success') return status;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        if (err instanceof HTTPError) {
          throw new Error(
            `Wayback Machine save: HTTP ${err.response.status} ${err.response.statusText}: ${await err.response.text()}`,
          );
        }
      }
    }
  })();
  if (result.http_status >= 400) {
    throw new Error('Wayback Machine save: http ' + result.http_status + ' error');
  }
  const resultUrl = `https://web.archive.org/web/${result.timestamp}/${result.original_url}`;
  const localJsonPath = path.join(argvUtils.getArgv()['outputDir'], 'wayback_machine.json');
  const localJson: string[] = await Bun.file(localJsonPath).json();
  if (localJson.includes(resultUrl) === false) localJson.push(resultUrl);
  await Bun.write(localJsonPath, JSON.stringify(localJson, null, 2));
  return resultUrl;
}

export default {
  login,
  savePage,
};
