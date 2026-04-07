import { Octokit } from '@octokit/rest';
import ky from 'ky';
import appConfig from './config.js';
import logger from './logger.js';

async function uploadAsset(
  client: Octokit,
  owner: string,
  repo: string,
  tag: string,
  url: string,
  targetFileName: string | null,
) {
  const release = await getReleaseInfo(client, owner, repo, tag);
  if (!release) throw new Error('GH release not found');
  const releaseId = release.id;

  logger.info(`Mirror archive: Downloading ${new URL(url).pathname.split('/').pop()} ...`);
  const name = targetFileName ?? new URL(url).pathname.split('/').pop() ?? '';
  const bin: Uint8Array = await ky.get(url, { headers: { 'User-Agent': appConfig.network.userAgent.minimum } }).bytes();
  const binSize: number = bin.byteLength;
  logger.info(`Mirror archive: Uploading ${new URL(url).pathname.split('/').pop()} ...`);
  await client.rest.repos.uploadReleaseAsset({
    owner,
    repo,
    release_id: releaseId,
    name,
    data: bin as any,
    // headers: { 'content-length': binSize },
  });
  return true;
}

async function uploadAssetWithBuffer(
  client: Octokit,
  owner: string,
  repo: string,
  tag: string,
  targetFileName: string,
  buffer: Uint8Array,
) {
  const release = await getReleaseInfo(client, owner, repo, tag);
  if (!release) throw new Error('GH release not found');
  const releaseId = release.id;

  logger.info(`Mirror archive: Uploading to ${tag}, ${targetFileName} ...`);
  await client.rest.repos.uploadReleaseAsset({
    owner,
    repo,
    release_id: releaseId,
    name: targetFileName,
    data: buffer as any,
    // headers: { 'content-length': buffer.byteLength },
  });
  return true;
}

async function getReleaseInfo(client: Octokit, owner: string, repo: string, tag: string) {
  const { data: release } = await client.rest.repos.getReleaseByTag({ owner, repo, tag });
  return release;
}

async function checkIsActionRunning(client: Octokit, owner: string, repo: string): Promise<boolean> {
  logger.debug('Checking GitHub Actions running status ...');
  const data = await client.rest.actions.listWorkflowRunsForRepo({ owner, repo });
  return data.data.workflow_runs.filter((e) => e.status === 'in_progress').length > 1;
}

async function createNewRelease(
  client: Octokit,
  owner: string,
  repo: string,
  tag: string,
  title: string,
  note: string,
  preRelFlag: boolean,
  draftFlag: boolean = false,
  targetCommitish: string = 'main',
) {
  const { data } = await client.rest.repos.createRelease({
    owner,
    repo,
    tag_name: tag,
    name: title,
    body: note,
    draft: draftFlag,
    prerelease: preRelFlag,
    target_commitish: targetCommitish,
  });
  return data;
}

async function deleteReleaseTag(client: Octokit, owner: string, repo: string, tag: string) {
  const { data: release } = await client.rest.repos.getReleaseByTag({ owner, repo, tag });
  await client.rest.repos.deleteRelease({ owner, repo, release_id: release.id });
  const data = await client.rest.git.deleteRef({ owner, repo, ref: `tags/${tag}` });
  return data;
}

export default {
  uploadAsset,
  uploadAssetWithBuffer,
  getReleaseInfo,
  checkIsActionRunning,
  createNewRelease,
  deleteReleaseTag,
};
