import test from 'node:test';
import assert from 'node:assert/strict';
import { retryWithBackoff, RetryableError } from './retry';

test('retryWithBackoff succeeds on first attempt', async () => {
  let attempts = 0;
  const result = await retryWithBackoff(async () => {
    attempts++;
    return 'success';
  }, { maxAttempts: 3 });
  
  assert.equal(result, 'success');
  assert.equal(attempts, 1);
});

test('retryWithBackoff retries on RetryableError', async () => {
  let attempts = 0;
  const result = await retryWithBackoff(async () => {
    attempts++;
    if (attempts < 3) {
      throw new RetryableError('Temporary failure');
    }
    return 'success';
  }, { maxAttempts: 3, baseDelayMs: 10 });
  
  assert.equal(result, 'success');
  assert.equal(attempts, 3);
});

test('retryWithBackoff throws immediately on non-retryable error', async () => {
  let attempts = 0;
  await assert.rejects(
    async () => {
      await retryWithBackoff(async () => {
        attempts++;
        throw new Error('Fatal error');
      }, { maxAttempts: 3 });
    },
    /Fatal error/
  );
  
  assert.equal(attempts, 1);
});

test('retryWithBackoff throws after max attempts exceeded', async () => {
  let attempts = 0;
  await assert.rejects(
    async () => {
      await retryWithBackoff(async () => {
        attempts++;
        throw new RetryableError('Always fails');
      }, { maxAttempts: 3, baseDelayMs: 1 });
    },
    /Always fails/
  );
  
  assert.equal(attempts, 3);
});
