import { Octokit } from '@octokit/rest';
import ky from 'ky';
import appConfig from './config.js';
import logger from './logger.js';
import retryUtils from './retry.js';

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
  const name = targetFileName ?? new URL(url).pathname.split('/').pop() ?? '';

  // Skip the download as well when the asset slot is already filled.
  if (await prepareUploadSlot(client, owner, repo, release, name, null)) return true;

  logger.info(`Mirror archive: Downloading ${name} ...`);
  const bin: Uint8Array = await retryUtils.withRetry(`download ${name}`, () =>
    ky.get(url, { headers: { 'User-Agent': appConfig.network.userAgent.minimum }, retry: 0 }).bytes(),
  );
  logger.info(`Mirror archive: Uploading ${name} ...`);
  await uploadToRelease(client, owner, repo, tag, releaseId, name, bin, null);
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

  if (await prepareUploadSlot(client, owner, repo, release, targetFileName, buffer.byteLength)) return true;

  logger.info(`Mirror archive: Uploading to ${tag}, ${targetFileName} ...`);
  await uploadToRelease(client, owner, repo, tag, releaseId, targetFileName, buffer, buffer.byteLength);
  return true;
}

/**
 * Uploads an asset, retrying the whole upload. A retry first checks whether the previous attempt
 * actually landed: GitHub keeps the asset even when the response is lost, and uploading the same
 * name again would fail with 422 (already_exists).
 */
async function uploadToRelease(
  client: Octokit,
  owner: string,
  repo: string,
  tag: string,
  releaseId: number,
  name: string,
  data: Uint8Array,
  expectedSize: number | null,
) {
  await retryUtils.withRetry(`upload ${name}`, async (attempt) => {
    if (attempt > 0) {
      const release = await getReleaseInfo(client, owner, repo, tag);
      if (await prepareUploadSlot(client, owner, repo, release, name, expectedSize)) return;
    }
    await client.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: releaseId,
      name,
      data: data as any,
    });
  });
}

async function getReleaseInfo(client: Octokit, owner: string, repo: string, tag: string) {
  const { data: release } = await client.rest.repos.getReleaseByTag({ owner, repo, tag });
  return release;
}

/**
 * Returns true when the asset slot is already filled (the upload can be skipped).
 * An asset whose state is not 'uploaded' was left behind by an interrupted run,
 * so it is removed before uploading again instead of being treated as valid.
 */
async function prepareUploadSlot(
  client: Octokit,
  owner: string,
  repo: string,
  release: Awaited<ReturnType<typeof getReleaseInfo>>,
  name: string,
  expectedSize: number | null,
): Promise<boolean> {
  const existing = release.assets.find((a) => a.name === name);
  if (!existing) return false;

  if (existing.state === 'uploaded' && (expectedSize === null || existing.size === expectedSize)) {
    logger.info(`Mirror archive: Already uploaded, skipping: ${name} (${existing.size} bytes)`);
    return true;
  }

  logger.warn(
    `Mirror archive: Removing incomplete asset and re-uploading: ${name} (state=${existing.state}, size=${existing.size})`,
  );
  await client.rest.repos.deleteReleaseAsset({ owner, repo, asset_id: existing.id });
  return false;
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
  prepareUploadSlot,
  getReleaseInfo,
  checkIsActionRunning,
  createNewRelease,
  deleteReleaseTag,
};
