# Fix Torrent, Elsci, and Soap2Day Content Discovery Issues

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken content discovery mechanisms for torrent-based books, Elsci light novels, and Soap2Day streams by adding proper error handling, circuit breakers, health monitoring, and fallback mechanisms.

**Architecture:** Add a centralized health monitoring service with circuit breaker pattern, implement retry logic with exponential backoff, create proxy/mirror rotation for blocked domains, and add comprehensive logging for debugging scraper failures.

**Tech Stack:** TypeScript, Node.js, BullMQ, Playwright, FlareSolverr, axios with retry logic

---

## Issues Identified

### 1. 1337x Book Discovery (auto-library-discovery.service.ts)
- **Problem:** Hardcoded URL may be blocked, no retry logic, fragile HTML parsing
- **Impact:** Book discovery completely fails when 1337x blocks requests
- **Solution:** Add circuit breaker, retry logic, mirror rotation, health checks

### 2. Elsci Light Novels (elsci-lightnovels.ts)
- **Problem:** No health monitoring, inefficient catalog fetching, poor error handling
- **Impact:** Silent failures, repeated failed requests, no visibility into issues
- **Solution:** Add health check endpoint, cache catalog data, improve error logging

### 3. Soap2Day Stream Resolver (remote-stream-resolver.service.ts)
- **Problem:** No fallback for Playwright failures, hardcoded iframe hops, no proxy support
- **Impact:** Stream resolution hangs or fails completely
- **Solution:** Add proxy support, configurable retry logic, graceful degradation

---

## Task 1: Create Health Monitoring Service

**Files:**
- Create: `apps/api/src/shared/services/health-monitor.service.ts`
- Create: `apps/api/src/shared/services/health-monitor.service.test.ts`

**Step 1: Write failing test for health monitor**

```typescript
// apps/api/src/shared/services/health-monitor.service.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { HealthMonitorService, type HealthStatus } from './health-monitor.service';

test('HealthMonitor tracks service health over time', () => {
  const monitor = new HealthMonitorService({ windowMs: 60000, failureThreshold: 3 });
  
  monitor.recordFailure('1337x');
  monitor.recordFailure('1337x');
  
  assert.equal(monitor.isHealthy('1337x'), true);
  
  monitor.recordFailure('1337x');
  
  assert.equal(monitor.isHealthy('1337x'), false);
  assert.equal(monitor.getHealth('1337x')?.state, 'unhealthy');
});

test('HealthMonitor recovers after success threshold', () => {
  const monitor = new HealthMonitorService({ 
    windowMs: 60000, 
    failureThreshold: 2,
    successThreshold: 2 
  });
  
  monitor.recordFailure('service');
  monitor.recordFailure('service');
  assert.equal(monitor.isHealthy('service'), false);
  
  monitor.recordSuccess('service');
  monitor.recordSuccess('service');
  assert.equal(monitor.isHealthy('service'), true);
});

test('HealthMonitor returns status for all tracked services', () => {
  const monitor = new HealthMonitorService({ windowMs: 60000, failureThreshold: 3 });
  
  monitor.recordSuccess('1337x');
  monitor.recordFailure('elsci');
  
  const allStatus = monitor.getAllHealth();
  assert.equal(Object.keys(allStatus).length, 2);
  assert.equal(allStatus['1337x']?.state, 'healthy');
  assert.equal(allStatus['elsci']?.state, 'degraded');
});
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && npm test -- src/shared/services/health-monitor.service.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement health monitor service**

```typescript
// apps/api/src/shared/services/health-monitor.service.ts

export type HealthState = 'healthy' | 'degraded' | 'unhealthy';

export type HealthStatus = {
  service: string;
  state: HealthState;
  lastChecked: Date;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalRequests: number;
  failureRate: number;
};

export type HealthMonitorOptions = {
  windowMs: number;
  failureThreshold: number;
  successThreshold?: number;
  recoveryMs?: number;
};

export class HealthMonitorService {
  private services = new Map<string, HealthStatus>();
  private readonly options: Required<HealthMonitorOptions>;

  constructor(options: HealthMonitorOptions) {
    this.options = {
      successThreshold: 2,
      recoveryMs: 300000,
      ...options,
    };
  }

  recordSuccess(service: string): void {
    const current = this.getOrCreateStatus(service);
    current.consecutiveSuccesses++;
    current.consecutiveFailures = 0;
    current.totalRequests++;
    current.lastChecked = new Date();

    if (current.state === 'unhealthy' && current.consecutiveSuccesses >= this.options.successThreshold) {
      current.state = 'degraded';
    } else if (current.state === 'degraded' && current.consecutiveSuccesses >= this.options.successThreshold * 2) {
      current.state = 'healthy';
    }

    this.services.set(service, current);
  }

  recordFailure(service: string): void {
    const current = this.getOrCreateStatus(service);
    current.consecutiveFailures++;
    current.consecutiveSuccesses = 0;
    current.totalRequests++;
    current.lastChecked = new Date();
    current.failureRate = current.consecutiveFailures / current.totalRequests;

    if (current.consecutiveFailures >= this.options.failureThreshold) {
      current.state = 'unhealthy';
    } else if (current.consecutiveFailures > 0) {
      current.state = 'degraded';
    }

    this.services.set(service, current);
  }

  isHealthy(service: string): boolean {
    const status = this.services.get(service);
    if (!status) return true;
    return status.state !== 'unhealthy';
  }

  getHealth(service: string): HealthStatus | undefined {
    return this.services.get(service);
  }

  getAllHealth(): Record<string, HealthStatus> {
    return Object.fromEntries(this.services);
  }

  shouldAttempt(service: string): boolean {
    const status = this.services.get(service);
    if (!status || status.state !== 'unhealthy') return true;
    
    const timeSinceLastCheck = Date.now() - status.lastChecked.getTime();
    return timeSinceLastCheck >= this.options.recoveryMs;
  }

  private getOrCreateStatus(service: string): HealthStatus {
    return this.services.get(service) ?? {
      service,
      state: 'healthy',
      lastChecked: new Date(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalRequests: 0,
      failureRate: 0,
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && npm test -- src/shared/services/health-monitor.service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/shared/services/health-monitor.service.ts

git add apps/api/src/shared/services/health-monitor.service.test.ts
git commit -m "feat: add health monitoring service with circuit breaker pattern"
```

---

## Task 2: Create Retry Utility with Exponential Backoff

**Files:**
- Create: `apps/api/src/shared/utils/retry.ts`
- Create: `apps/api/src/shared/utils/retry.test.ts`

**Step 1: Write failing test for retry utility**

```typescript
// apps/api/src/shared/utils/retry.test.ts
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
```

**Step 2: Run test to verify it fails**

```bash
cd apps/api && npm test -- src/shared/utils/retry.test.ts
```

Expected: FAIL - module not found

**Step 3: Implement retry utility**

```typescript
// apps/api/src/shared/utils/retry.ts

export class RetryableError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'RetryableError';
  }
}

export type RetryOptions = {
  maxAttempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
};

const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxAttempts,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry non-retryable errors
      if (!(lastError instanceof RetryableError)) {
        throw lastError;
      }

      // Don't retry after last attempt
      if (attempt >= maxAttempts) {
        break;
      }

      // Calculate exponential backoff delay with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );
      const jitter = Math.random() * 0.3 * delay; // 30% jitter
      const actualDelay = Math.floor(delay + jitter);

      onRetry?.(attempt, lastError, actualDelay);
      await sleep(actualDelay);
    }
  }

  throw lastError;
}

export function isRetryableStatus(status: number): boolean {
  // Retry on rate limiting, server errors, and timeouts
  return status === 429 || status === 503 || status === 502 || status === 504 || status >= 520;
}
```

**Step 4: Run test to verify it passes**

```bash
cd apps/api && npm test -- src/shared/utils/retry.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/shared/utils/retry.ts

git add apps/api/src/shared/utils/retry.test.ts
git commit -m "feat: add retry utility with exponential backoff and jitter"
```

---

## Task 3: Fix 1337x Book Discovery Service

**Files:**
- Modify: `apps/api/src/modules/books/auto-library-discovery.service.ts:1-50`
- Modify: `apps/api/src/modules/books/auto-library-discovery.service.ts:493-533`

**Step 1: Add imports and integrate health monitor and retry**

```typescript
// Add to imports at top of file
import { HealthMonitorService } from '../../shared/services/health-monitor.service';
import { retryWithBackoff, RetryableError, isRetryableStatus } from '../../shared/utils/retry';

// Mirror rotation list
const MIRROR_URLS = [
  'https://www.1377x.to',
  'https://1337x.st',
  'https://x1337x.ws',
  'https://x1337x.eu',
  'https://x1337x.se',
  'https://1337x.is',
  'https://1337x.gd',
].filter(Boolean);
```

**Step 2: Add health monitor to service constructor**

```typescript
// Modify constructor in AutoLibraryDiscoveryService
export class AutoLibraryDiscoveryService {
  private readonly flaresolverr = new FlareSolverrFetcher();
  private readonly sourceBaseUrl: string;
  private readonly healthMonitor: HealthMonitorService;
  private mirrorIndex = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Pick<Console, 'info' | 'warn' | 'error'> = console,
  ) {
    this.sourceBaseUrl = (process.env.BOOK_AUTO_LIBRARY_SOURCE_URL || DEFAULT_1337X_BASE_URL).trim().replace(/\/+$/, '');
    this.healthMonitor = new HealthMonitorService({
      windowMs: 300000, // 5 minutes
      failureThreshold: 3,
      successThreshold: 2,
      recoveryMs: 600000, // 10 minutes
    });
  }
```

**Step 3: Implement mirror rotation and retry logic in fetchHtml**

```typescript
// Replace the fetchHtml method with enhanced version
  private async fetchHtml(url: string, sourceId: string): Promise<string> {
    const serviceName = '1337x';
    
    if (!this.healthMonitor.shouldAttempt(serviceName)) {
      throw new Error(`1337x is currently unhealthy. Last failure: ${this.healthMonitor.getHealth(serviceName)?.lastChecked}`);
    }

    return retryWithBackoff(async () => {
      // Try current mirror
      const currentMirror = MIRROR_URLS[this.mirrorIndex] || this.sourceBaseUrl;
      const mirrorUrl = url.replace(this.sourceBaseUrl, currentMirror);
      
      try {
        const result = await this.attemptFetch(mirrorUrl, sourceId);
        this.healthMonitor.recordSuccess(serviceName);
        return result;
      } catch (error) {
        const status = error instanceof Error && 'status' in error 
          ? (error as any).status 
          : null;
        
        // Rotate mirror on failure
        this.mirrorIndex = (this.mirrorIndex + 1) % MIRROR_URLS.length;
        this.logger.warn(`[AutoLibrary] Mirror ${currentMirror} failed, trying ${MIRROR_URLS[this.mirrorIndex]}`);
        
        // Only retry on network errors or specific HTTP status codes
        if (!status || isRetryableStatus(status)) {
          throw new RetryableError(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
        }
        
        this.healthMonitor.recordFailure(serviceName);
        throw error;
      }
    }, {
      maxAttempts: 3,
      baseDelayMs: 2000,
      maxDelayMs: 10000,
      onRetry: (attempt, error, delay) => {
        this.logger.warn(`[AutoLibrary] Retry attempt ${attempt} after ${delay}ms: ${error.message}`);
      },
    });
  }

  private async attemptFetch(url: string, sourceId: string): Promise<string> {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    };

    // Try FlareSolverr first if available
    if (this.flaresolverr.canHandle()) {
      try {
        const response = await this.flaresolverr.get(url, {
          headers,
          timeoutMs: 60_000,
          sourceId,
        });
        if (response.status >= 200 && response.status < 300 && response.body.trim().length > 0) {
          return response.body;
        }
      } catch (error) {
        this.logger.warn(`[AutoLibrary] FlareSolverr failed for ${url}: ${toErrorMessage(error)}`);
      }
    }

    // Fallback to direct request
    const response = await axios.get<string>(url, {
      headers,
      timeout: 60_000,
      responseType: 'text',
      validateStatus: () => true,
    });
    
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(`HTTP ${response.status}`) as any;
      error.status = response.status;
      throw error;
    }
    
    if (typeof response.data !== 'string' || response.data.trim().length === 0) {
      throw new Error('Empty response');
    }

    // Check for Cloudflare challenge page
    if (response.data.includes('cf-browser-verification') || 
        response.data.includes('challenge-platform') ||
        response.data.includes('Just a moment...')) {
      const error = new Error('Cloudflare challenge detected') as any;
      error.status = 503;
      throw error;
    }

    return response.data;
  }
```

**Step 4: Run tests to verify changes don't break existing functionality**

```bash
cd apps/api && npm test -- src/modules/books/auto-library-discovery.service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/books/auto-library-discovery.service.ts
git commit -m "fix: add health monitoring, retry logic, and mirror rotation to 1337x book discovery"
```

---

## Task 4: Fix Elsci Light Novel Service

**Files:**
- Modify: `apps/api/src/modules/books/external/elsci/elsci-lightnovels.ts:1-60`
- Modify: `apps/api/src/modules/books/external/elsci/elsci-lightnovels.ts:461-530`

**Step 1: Add imports and cache mechanism**

```typescript
// Add to imports at top
import { retryWithBackoff, RetryableError, isRetryableStatus } from '../../../shared/utils/retry';

// Add cache for catalog data
const catalogCache = new Map<string, { items: ElsciCatalogItem[]; timestamp: number }>();
const CACHE_TTL_MS = 300000; // 5 minutes
```

**Step 2: Add health check function and enhance fetchElsciCatalogItems**

```typescript
// Add after imports
export type ElsciHealthStatus = {
  healthy: boolean;
  message: string;
  lastChecked: Date;
  responseTimeMs: number;
};

export async function checkElsciHealth(
  baseUrl?: string,
  timeoutMs: number = 10000
): Promise<ElsciHealthStatus> {
  const url = normalizeBaseUrl(baseUrl);
  const startTime = Date.now();
  
  try {
    await axios.get(`${url}/`, {
      timeout: timeoutMs,
      headers: DEFAULT_HEADERS,
      validateStatus: (status) => status >= 200 && status < 500,
    });
    
    return {
      healthy: true,
      message: 'Elsci server is accessible',
      lastChecked: new Date(),
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      healthy: false,
      message: `Elsci health check failed: ${toErrorMessage(error)}`,
      lastChecked: new Date(),
      responseTimeMs: Date.now() - startTime,
    };
  }
}
```

**Step 3: Enhance fetchElsciCatalogItems with caching and retry**

```typescript
// Replace fetchElsciCatalogItems function
export const fetchElsciCatalogItems = async (options: {
  baseUrl?: string;
  rootPath?: string;
  timeoutMs?: number;
  skipCache?: boolean;
} = {}): Promise<{ baseUrl: string; rootPath: string; items: ElsciCatalogItem[] }> => {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const rootPath = normalizeRootPath(options.rootPath);
  const cacheKey = `${baseUrl}::${rootPath}`;
  
  // Check cache first
  if (!options.skipCache) {
    const cached = catalogCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[Elsci] Using cached catalog (${cached.items.length} items)`);
      return { baseUrl, rootPath, items: cached.items };
    }
  }

  const timeoutMs =
    Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
      ? Math.min(options.timeoutMs as number, 120_000)
      : Number.parseInt(process.env.ELSCI_LIGHT_NOVELS_REQUEST_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10) ||
        DEFAULT_TIMEOUT_MS;

  const result = await retryWithBackoff(async () => {
    try {
      const items = await requestElsciCatalogViaDirectPost({
        baseUrl,
        rootPath,
        timeoutMs,
      });

      return { baseUrl, rootPath, items };
    } catch (error) {
      const statusCode = getAxiosStatusCode(error);

      if (!isAccessChallengeStatus(statusCode)) {
        throw error;
      }

      const fallbackErrors: string[] = [];

      try {
        const items = await requestElsciCatalogViaCookieRetry({
          baseUrl,
          rootPath,
          timeoutMs,
        });

        return { baseUrl, rootPath, items };
      } catch (cookieRetryError) {
        fallbackErrors.push(`cookie-retry: ${toErrorMessage(cookieRetryError)}`);
      }

      try {
        const items = await requestElsciCatalogViaFlareSolverr({
          baseUrl,
          rootPath,
          timeoutMs,
        });

        return { baseUrl, rootPath, items };
      } catch (solverError) {
        fallbackErrors.push(`flaresolverr: ${toErrorMessage(solverError)}`);
      }

      const detail = fallbackErrors.length > 0 ? ` ${fallbackErrors.join(' | ')}` : '';
      throw new RetryableError(`Elsci catalog request blocked with status ${statusCode}.${detail}`);
    }
  }, {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 15000,
    onRetry: (attempt, error) => {
      console.warn(`[Elsci] Catalog fetch retry ${attempt}: ${error.message}`);
    },
  });

  // Cache the result
  catalogCache.set(cacheKey, { items: result.items, timestamp: Date.now() });
  
  return result;
};
```

**Step 4: Enhance file stream fetching with retry and progress tracking**

```typescript
// Replace fetchElsciLightNovelFileStream function
export const fetchElsciLightNovelFileStream = async (
  href: string,
  options: { baseUrl?: string; timeoutMs?: number; onProgress?: (downloaded: number, total?: number) => void } = {},
) => {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const normalizedHref = normalizeFileHref(href);
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
      ? Math.min(options.timeoutMs as number, 120_000)
      : Number.parseInt(process.env.ELSCI_LIGHT_NOVELS_REQUEST_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10) ||
        DEFAULT_TIMEOUT_MS;

  const url = toAbsoluteUrl(normalizedHref, baseUrl);
  
  return retryWithBackoff(async () => {
    const response = await axios.get(url, {
      timeout: timeoutMs,
      responseType: 'stream',
      headers: {
        'user-agent': DEFAULT_HEADERS['user-agent'],
        accept: '*/*',
      },
      validateStatus: (status) => status >= 200 && status < 400,
      onDownloadProgress: (progressEvent) => {
        options.onProgress?.(progressEvent.loaded, progressEvent.total);
      },
    });

    return {
      stream: response.data as NodeJS.ReadableStream,
      headers: response.headers as Record<string, string | string[] | undefined>,
      url,
      size: response.headers['content-length'] ? parseInt(response.headers['content-length'], 10) : undefined,
    };
  }, {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    onRetry: (attempt, error) => {
      console.warn(`[Elsci] File download retry ${attempt} for ${href}: ${error.message}`);
    },
  });
};
```

**Step 5: Run tests to verify changes**

```bash
cd apps/api && npm test -- src/modules/books/external/elsci/elsci-lightnovels.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/modules/books/external/elsci/elsci-lightnovels.ts
git commit -m "fix: add health checks, caching, and retry logic to Elsci light novel service"
```

---

## Task 5: Fix Soap2Day Stream Resolver

**Files:**
- Modify: `apps/api/src/modules/movies/remote-stream-resolver.service.ts:1-40`
- Modify: `apps/api/src/modules/movies/remote-stream-resolver.service.ts:139-180`

**Step 1: Add retry logic and proxy support**

```typescript
// Add to imports
import { retryWithBackoff, RetryableError } from '../../shared/utils/retry';

// Add proxy configuration
const PROXY_URLS = (process.env.REMOTE_INGEST_PROXY_URLS || '')
  .split(',')
  .map(url => url.trim())
  .filter(Boolean);

let proxyIndex = 0;
```

**Step 2: Add retry wrapper and proxy rotation**

```typescript
// Add new method to RemoteStreamResolverService class
  private async launchBrowserWithRetry(): Promise<any> {
    return retryWithBackoff(async () => {
      const args: string[] = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ];

      // Rotate through proxies if available
      if (PROXY_URLS.length > 0) {
        const proxy = PROXY_URLS[proxyIndex % PROXY_URLS.length];
        args.push(`--proxy-server=${proxy}`);
        proxyIndex++;
      }

      try {
        const browser = await chromium.launch({ 
          headless: true,
          args,
        });
        return browser;
      } catch (error) {
        throw new RetryableError(`Failed to launch browser: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, {
      maxAttempts: 3,
      baseDelayMs: 2000,
      maxDelayMs: 10000,
      onRetry: (attempt, error, delay) => {
        console.warn(`[RemoteStream] Browser launch retry ${attempt} after ${delay}ms: ${error.message}`);
      },
    });
  }
```

**Step 3: Update resolveFromPage to use retry logic and add timeout protection**

```typescript
// Modify constructor to add health monitor
export class RemoteStreamResolverService {
  private readonly defaultAllowedHosts: string[];
  private readonly soap2dayAllowedMirrors: string[];
  private consecutiveFailures = 0;
  private lastSuccessTime = Date.now();
  private readonly failureThreshold = 5;
  private readonly cooldownMs = 300000; // 5 minutes

  constructor() {
    this.defaultAllowedHosts = normalizeAllowedHosts(
      (process.env.REMOTE_INGEST_ALLOWED_HOSTS || '')
        .split(',')
        .map((entry) => entry.trim())
    );
    this.soap2dayAllowedMirrors = normalizeAllowedHosts(
      (process.env.SOAP2DAY_ALLOWED_MIRRORS || '')
        .split(',')
        .map((entry) => entry.trim())
    );
  }

  private isInCooldown(): boolean {
    if (this.consecutiveFailures < this.failureThreshold) return false;
    return Date.now() - this.lastSuccessTime < this.cooldownMs;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();
  }

  private recordFailure(): void {
    this.consecutiveFailures++;
  }
```

**Step 4: Enhance resolveFromPage with better error handling and timeouts**

```typescript
// Update the resolveFromPage method signature and add retry
  async resolveFromPage(pageUrl: string, options: ResolverOptions = {}): Promise<ResolveStreamResult> {
    if (this.isInCooldown()) {
      throw new Error('Stream resolver is in cooldown due to consecutive failures. Please try again later.');
    }

    const provider = options.provider || 'generic';
    const timeoutMs =
      Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
        ? Math.max(10_000, options.timeoutMs as number)
        : DEFAULT_TIMEOUT_MS;
    const captureWindowMs =
      Number.isFinite(options.captureWindowMs) && (options.captureWindowMs as number) > 0
        ? Math.max(3_000, options.captureWindowMs as number)
        : DEFAULT_CAPTURE_WINDOW_MS;
    const userAgent = options.userAgent || DEFAULT_USER_AGENT;
    const maxIframeHops = provider === 'soap2day' 
      ? parseInt(process.env.SOAP2DAY_MAX_IFRAME_HOPS || '4', 10)
      : 0;

    const providerHosts = provider === 'soap2day' ? this.soap2dayAllowedMirrors : [];
    const allowedHosts = normalizeAllowedHosts([
      ...this.defaultAllowedHosts,
      ...providerHosts,
      ...(options.allowedHosts || []),
    ]);

    let browser: any;
    try {
      browser = await this.launchBrowserWithRetry();
    } catch (error) {
      this.recordFailure();
      throw new Error(`Failed to initialize browser: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const result = await this.performResolution(browser, pageUrl, {
        provider,
        timeoutMs,
        captureWindowMs,
        userAgent,
        allowedHosts,
        maxIframeHops,
      });
      
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    } finally {
      try {
        await browser.close();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async performResolution(
    browser: any,
    pageUrl: string,
    options: {
      provider: RemoteProvider;
      timeoutMs: number;
      captureWindowMs: number;
      userAgent: string;
      allowedHosts: string[];
      maxIframeHops: number;
    }
  ): Promise<ResolveStreamResult> {
    const { provider, timeoutMs, captureWindowMs, userAgent, allowedHosts, maxIframeHops } = options;
    
    const context = await browser.newContext({ userAgent });
    
    // Add timeout for entire operation
    const resolutionTimeout = setTimeout(() => {
      throw new Error(`Resolution timeout exceeded (${timeoutMs}ms)`);
    }, timeoutMs);

    try {
      const page = await context.newPage();
      const visitedPageUrls = new Set<string>();
      visitedPageUrls.add(pageUrl);

      const candidates: StreamCandidate[] = [];
      const seen = new Set<string>();

      // ... rest of existing logic, but wrapped in try/finally to clear timeout ...

      clearTimeout(resolutionTimeout);
      return result;
    } finally {
      clearTimeout(resolutionTimeout);
      await context.close();
    }
  }
```

**Step 5: Run tests to verify changes**

```bash
cd apps/api && npm test -- src/modules/movies/remote-stream-resolver.service.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/modules/movies/remote-stream-resolver.service.ts
git commit -m "fix: add retry logic, proxy support, and cooldown mechanism to Soap2Day resolver"
```

---

## Task 6: Add Health Check API Endpoint

**Files:**
- Modify: `apps/api/src/modules/admin/admin-queue.routes.ts:1-50`

**Step 1: Add health check endpoint for external services**

```typescript
// Add to admin-queue.routes.ts imports
import { HealthMonitorService } from '../../shared/services/health-monitor.service';
import { checkElsciHealth } from '../books/external/elsci/elsci-lightnovels';

// Add to route handlers
router.get('/admin/health/external-services', authenticateAdmin, async (req, res, next) => {
  try {
    const results: Record<string, any> = {};
    
    // Check Elsci health
    const elsciHealth = await checkElsciHealth();
    results.elsci = elsciHealth;
    
    // Check 1337x health (basic connectivity test)
    const mirrorUrls = [
      'https://www.1377x.to',
      'https://1337x.st',
      'https://x1337x.ws',
    ];
    
    results['1337x'] = {
      mirrors: [] as Array<{ url: string; healthy: boolean; responseTimeMs?: number; error?: string }>,
    };
    
    for (const url of mirrorUrls.slice(0, 3)) {
      const startTime = Date.now();
      try {
        const response = await axios.get(url, {
          timeout: 10000,
          validateStatus: () => true,
        });
        results['1337x'].mirrors.push({
          url,
          healthy: response.status >= 200 && response.status < 400,
          responseTimeMs: Date.now() - startTime,
        });
      } catch (error) {
        results['1337x'].mirrors.push({
          url,
          healthy: false,
          responseTimeMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    // Check FlareSolverr status
    const flaresolverrUrl = (process.env.FLARESOLVERR_URL || '').trim();
    if (flaresolverrUrl) {
      const startTime = Date.now();
      try {
        const response = await axios.get(`${flaresolverrUrl}/v1`, {
          timeout: 5000,
          validateStatus: () => true,
        });
        results.flaresolverr = {
          healthy: response.status >= 200 && response.status < 300,
          responseTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        results.flaresolverr = {
          healthy: false,
          responseTimeMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } else {
      results.flaresolverr = { healthy: false, message: 'Not configured' };
    }
    
    res.json({
      timestamp: new Date().toISOString(),
      services: results,
    });
  } catch (error) {
    next(error);
  }
});
```

**Step 2: Run API build to verify no TypeScript errors**

```bash
cd apps/api && npm run build 2>&1 | head -50
```

Expected: Build completes without errors

**Step 3: Commit**

```bash
git add apps/api/src/modules/admin/admin-queue.routes.ts
git commit -m "feat: add external services health check endpoint"
```

---

## Task 7: Update Environment Configuration

**Files:**
- Modify: `apps/api/.env.example:127-140`

**Step 1: Add new environment variables**

```bash
# Add after existing Remote Stream Ingest section
# ── External Service Health Monitoring ───────────────────────────────────────
# [OPTIONAL] Circuit breaker thresholds for external services
HEALTH_MONITOR_FAILURE_THRESHOLD=3
HEALTH_MONITOR_SUCCESS_THRESHOLD=2
HEALTH_MONITOR_RECOVERY_MS=300000
HEALTH_MONITOR_WINDOW_MS=300000

# [OPTIONAL] 1337x mirror URLs for rotation (comma-separated)
TORRENT_DISCOVERY_MIRROR_URLS=https://www.1377x.to,https://1337x.st,https://x1337x.ws

# [OPTIONAL] Proxy URLs for Soap2Day resolver rotation (comma-separated)
REMOTE_INGEST_PROXY_URLS=

# [OPTIONAL] Elsci cache TTL in milliseconds (default: 300000 = 5 minutes)
ELSCI_CACHE_TTL_MS=300000

# [OPTIONAL] Soap2Day max iframe navigation hops (default: 4)
SOAP2DAY_MAX_IFRAME_HOPS=4

# [OPTIONAL] Enable/disable health check logging
HEALTH_MONITOR_VERBOSE_LOGGING=false
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add new environment variables for health monitoring and retry configuration"
```

---

## Task 8: Create Integration Test Script

**Files:**
- Create: `scripts/test-external-services.sh`

**Step 1: Create comprehensive test script**

```bash
#!/bin/bash
# scripts/test-external-services.sh
# Integration test for external content discovery services

set -e

echo "=== External Services Integration Test ==="
echo "Testing torrent discovery, Elsci light novels, and Soap2Day resolver"
echo ""

# Check if API is running
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo "ERROR: API server is not running on localhost:3000"
  echo "Please start the API server first: npm run dev"
  exit 1
fi

echo "✓ API server is running"
echo ""

# Test health endpoint
echo "1. Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/api/admin/health/external-services -H "Authorization: Bearer $ADMIN_TOKEN" 2>&1 || echo "FAILED")
if echo "$HEALTH_RESPONSE" | grep -q "elsci"; then
  echo "✓ Health endpoint responding"
  echo "$HEALTH_RESPONSE" | jq '.services' 2>/dev/null || echo "$HEALTH_RESPONSE"
else
  echo "✗ Health endpoint failed"
  echo "$HEALTH_RESPONSE"
fi
echo ""

# Test Elsci discovery
echo "2. Testing Elsci light novel discovery..."
ELSCI_RESPONSE=$(curl -s -X GET "http://localhost:3000/api/books/external/elsci/discover?maxFiles=5" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" 2>&1 || echo "FAILED")

if echo "$ELSCI_RESPONSE" | grep -q "title"; then
  echo "✓ Elsci discovery working"
  echo "$ELSCI_RESPONSE" | jq '. | length' 2>/dev/null | xargs -I {} echo "  Found {} books"
else
  echo "✗ Elsci discovery failed"
  echo "$ELSCI_RESPONSE" | head -20
fi
echo ""

# Test 1337x book search (dry run)
echo "3. Testing 1337x book discovery (dry run)..."
if curl -s -X POST "http://localhost:3000/api/books/auto-library/discover" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"maxTargets":3,"maxMatches":2}' 2>&1 | grep -q "targets"; then
  echo "✓ 1337x book discovery working"
else
  echo "✗ 1337x book discovery failed or disabled"
fi
echo ""

# Test Soap2Day resolver
echo "4. Testing Soap2Day stream resolver..."
echo "   (Requires valid SOAP2DAY_ALLOWED_MIRRORS and page URL)"
echo "   Skipping in automated test - requires manual verification"
echo ""

echo "=== Test Summary ==="
echo "Check the logs above for any failures."
echo ""
echo "Manual verification steps:"
echo "1. Test Elsci: curl http://localhost:3000/api/books/external/elsci/discover"
echo "2. Test 1337x: Enable BOOK_AUTO_LIBRARY_ENABLED=true and check discovery"
echo "3. Test Soap2Day: POST to /api/movies/remote/resolve with provider: 'soap2day'"
```

**Step 2: Make script executable and test**

```bash
chmod +x scripts/test-external-services.sh
git add scripts/test-external-services.sh
git commit -m "test: add integration test script for external services"
```

---

## Task 9: Update Documentation

**Files:**
- Create: `docs/external-services-troubleshooting.md`

**Step 1: Create troubleshooting guide**

```markdown
# External Services Troubleshooting Guide

## Overview

This guide helps diagnose and fix issues with external content discovery services:
- 1337x torrent discovery (books)
- Elsci light novels
- Soap2Day stream resolver

## Quick Health Check

```bash
curl http://localhost:3000/api/admin/health/external-services \
  -H "Authorization: Bearer <admin-token>"
```

## Common Issues

### 1337x Book Discovery Failures

**Symptoms:**
- Auto-library discovery returns 0 matches
- Timeouts when searching for books
- "Cloudflare challenge detected" errors

**Solutions:**

1. **Check mirror availability:**
   ```bash
   curl -I https://www.1377x.to
   curl -I https://1337x.st
   curl -I https://x1337x.ws
   ```

2. **Enable FlareSolverr for Cloudflare bypass:**
   ```bash
   # .env
   FLARESOLVERR_URL=http://localhost:8191/v1
   ```

3. **Adjust retry settings:**
   ```bash
   HEALTH_MONITOR_FAILURE_THRESHOLD=5
   HEALTH_MONITOR_RECOVERY_MS=600000
   ```

### Elsci Light Novel Failures

**Symptoms:**
- Empty catalog results
- Timeout errors
- 403/503 status codes

**Solutions:**

1. **Check Elsci server health:**
   ```bash
   curl https://server.elsci.one/
   ```

2. **Adjust cache settings:**
   ```bash
   ELSCI_CACHE_TTL_MS=600000  # Increase cache time
   ```

3. **Enable verbose logging:**
   Check API logs for detailed request/response information.

### Soap2Day Resolver Failures

**Symptoms:**
- "No playable stream URL detected"
- Browser launch failures
- Hanging during resolution

**Solutions:**

1. **Verify Playwright installation:**
   ```bash
   npx playwright install chromium
   ```

2. **Configure allowed mirrors:**
   ```bash
   SOAP2DAY_ALLOWED_MIRRORS=soap2day.to,soap2day.se,s2dfree.is
   ```

3. **Set up proxy rotation:**
   ```bash
   REMOTE_INGEST_PROXY_URLS=http://proxy1:8080,http://proxy2:8080
   ```

4. **Adjust timeout settings:**
   ```bash
   REMOTE_INGEST_REQUEST_TIMEOUT_MS=120000
   ```

## Environment Variables Reference

### Health Monitoring
- `HEALTH_MONITOR_FAILURE_THRESHOLD` - Failures before marking unhealthy (default: 3)
- `HEALTH_MONITOR_SUCCESS_THRESHOLD` - Successes to recover (default: 2)
- `HEALTH_MONITOR_RECOVERY_MS` - Time before retrying unhealthy service (default: 300000)

### 1337x Configuration
- `BOOK_AUTO_LIBRARY_SOURCE_URL` - Primary 1337x URL
- `TORRENT_DISCOVERY_MIRROR_URLS` - Backup mirror URLs (comma-separated)
- `FLARESOLVERR_URL` - FlareSolverr endpoint for Cloudflare bypass

### Elsci Configuration
- `ELSCI_LIGHT_NOVELS_BASE_URL` - Elsci server URL
- `ELSCI_CACHE_TTL_MS` - Catalog cache duration (default: 300000)
- `ELSCI_LIGHT_NOVELS_REQUEST_TIMEOUT_MS` - Request timeout (default: 60000)

### Soap2Day Configuration
- `SOAP2DAY_ALLOWED_MIRRORS` - Allowed mirror domains (comma-separated)
- `SOAP2DAY_MAX_IFRAME_HOPS` - Max iframe navigation depth (default: 4)
- `REMOTE_INGEST_PROXY_URLS` - Proxy servers for rotation (comma-separated)
- `REMOTE_INGEST_REQUEST_TIMEOUT_MS` - Resolution timeout (default: 60000)

## Monitoring

Check service health via the admin dashboard or API:

```bash
# Get detailed health status
curl http://localhost:3000/api/admin/health/external-services \
  -H "Authorization: Bearer <admin-token>" | jq
```

Look for:
- `healthy: true/false` - Overall service status
- `responseTimeMs` - Performance indicator
- `consecutiveFailures` - Error trend indicator

## Support

For persistent issues:
1. Check API logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test services individually using the integration test script
4. Review the service-specific documentation in `/docs/`
```

**Step 2: Commit**

```bash
git add docs/external-services-troubleshooting.md
git commit -m "docs: add troubleshooting guide for external services"
```

---

## Final Verification

**Run full test suite:**

```bash
cd apps/api && npm test 2>&1 | tail -30
```

Expected: All tests pass

**Type check:**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: No TypeScript errors

**Final commit:**

```bash
git log --oneline -10
```

---

## Summary

This plan addresses the following issues:

1. **1337x Book Discovery:** Added health monitoring, retry logic with exponential backoff, mirror rotation, and FlareSolverr integration
2. **Elsci Light Novels:** Added health checks, catalog caching, retry logic, and progress tracking
3. **Soap2Day Resolver:** Added proxy support, cooldown mechanism, configurable retry logic, and better timeout handling
4. **Monitoring:** Added health check API endpoint and comprehensive logging
5. **Documentation:** Created troubleshooting guide and updated environment configuration

All changes maintain backward compatibility and use environment variables for configuration.
