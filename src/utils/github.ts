import { Octokit } from '@octokit/rest';
import ky from 'ky';
import appConfig from './config.js';
import logger from './logger.js';

async function uploadAsset(
  client: Octokit | null,
  authCfg: { token: string; owner: string; repo: string; tag: string } | null,
  url: string,
  targetFileName: string | null,
) {
  if (!client || !authCfg) return;
  const { data: release } = await client.rest.repos.getReleaseByTag({
    owner: authCfg.owner,
    repo: authCfg.repo,
    tag: authCfg.tag,
  });
  const releaseId = release.id;

  logger.info(`Mirror archive: Downloading ${new URL(url).pathname.split('/').pop()} ...`);
  const name = targetFileName ?? new URL(url).pathname.split('/').pop() ?? '';
  const bin: Uint8Array = await ky.get(url, { headers: { 'User-Agent': appConfig.network.userAgent.minimum } }).bytes();
  const binSize: number = bin.byteLength;
  logger.info(`Mirror archive: Uploading ${new URL(url).pathname.split('/').pop()} ...`);
  await client.rest.repos.uploadReleaseAsset({
    owner: authCfg.owner,
    repo: authCfg.repo,
    release_id: releaseId,
    name,
    data: bin as any,
    headers: { 'content-length': binSize },
  });
}

export default {
  uploadAsset,
};
