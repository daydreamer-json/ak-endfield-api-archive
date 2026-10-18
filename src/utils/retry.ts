import logger from './logger.js';

// Total attempts of a single download / upload operation.
const retryLimit = 3;
// Base delay between attempts. The delay grows linearly with the attempt number.
const retryDelayMs = 1000;

/**
 * Retries the whole operation on any failure. The built-in ky retry only covers a subset of
 * HTTP errors (it ignores e.g. 403 / 404), so every download and upload goes through here instead
 * with `retry: 0` set on the underlying request.
 * The callback receives the attempt number, starting at 0 for the first try.
 */
async function withRetry<T>(label: string, fn: (attempt: number) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt + 1 >= retryLimit) {
        logger.error(`Retry limit reached (${retryLimit} attempts): ${label} (${err})`);
        throw err;
      }
      const delay = retryDelayMs * (attempt + 1);
      logger.warn(`Retrying ${attempt + 2}/${retryLimit} in ${delay}ms: ${label} (${err})`);
      await Bun.sleep(delay);
    }
  }
}

export default { withRetry };
