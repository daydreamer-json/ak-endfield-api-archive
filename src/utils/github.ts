import { Octokit } from '@octokit/rest';
import ky from 'ky';
import appConfig from './config.js';
import logger from './logger.js';

async function uploadAsset(
  client: Octokit | null,
  authCfg: {
    github: {
      relArchive: { token: string; owner: string; repo: string; tag: string };
      main: { token: string; owner: string; repo: string };
    };
  } | null,
  url: string,
  targetFileName: string | null,
) {
  if (!client || !authCfg) return;
  const release = await getReleaseInfo(client, authCfg);
  if (!release) throw new Error('GH release not found');
  const releaseId = release.id;

  logger.info(`Mirror archive: Downloading ${new URL(url).pathname.split('/').pop()} ...`);
  const name = targetFileName ?? new URL(url).pathname.split('/').pop() ?? '';
  const bin: Uint8Array = await ky.get(url, { headers: { 'User-Agent': appConfig.network.userAgent.minimum } }).bytes();
  const binSize: number = bin.byteLength;
  logger.info(`Mirror archive: Uploading ${new URL(url).pathname.split('/').pop()} ...`);
  await client.rest.repos.uploadReleaseAsset({
    owner: authCfg.github.relArchive.owner,
    repo: authCfg.github.relArchive.repo,
    release_id: releaseId,
    name,
    data: bin as any,
    headers: { 'content-length': binSize },
  });
}

async function getReleaseInfo(
  client: Octokit | null,
  authCfg: {
    github: {
      relArchive: { token: string; owner: string; repo: string; tag: string };
      main: { token: string; owner: string; repo: string };
    };
  } | null,
) {
  if (!client || !authCfg) return;
  const { data: release } = await client.rest.repos.getReleaseByTag({
    owner: authCfg.github.relArchive.owner,
    repo: authCfg.github.relArchive.repo,
    tag: authCfg.github.relArchive.tag,
  });
  return release;
}

async function checkIsActionRunning(
  authCfg: {
    github: {
      relArchive: { token: string; owner: string; repo: string; tag: string };
      main: { token: string; owner: string; repo: string };
    };
  } | null,
): Promise<boolean> {
  if (!authCfg) return false;
  logger.debug('Checking GitHub Actions running status ...');
  const client = new Octokit({ auth: authCfg.github.main.token });
  const data = await client.rest.actions.listWorkflowRunsForRepo({
    owner: authCfg.github.main.owner,
    repo: authCfg.github.main.repo,
  });
  return data.data.workflow_runs.filter((e) => e.status === 'in_progress').length > 1;
}

export default {
  uploadAsset,
  getReleaseInfo,
  checkIsActionRunning,
};
