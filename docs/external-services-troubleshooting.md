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

## Docker Deployment Notes

When using Docker (as with your VPS blue-green deployment):

1. **Environment Variables:**
   - Ensure all new environment variables are set in your docker-compose.yml or .env file
   - The health monitoring and retry logic work transparently in containers

2. **FlareSolverr Integration:**
   - Run FlareSolverr as a separate container
   - Set `FLARESOLVERR_URL=http://flaresolverr:8191/v1` in your API container

3. **Proxy Support:**
   - For Soap2Day resolver, proxies can be configured via `REMOTE_INGEST_PROXY_URLS`
   - Works with HTTP/HTTPS proxies in containerized environments

4. **Health Checks:**
   - The new health endpoint is available at `/api/admin/health/external-services`
   - Monitor this endpoint in your load balancer or monitoring system

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

## Blue-Green Deployment Considerations

Since you're using blue-green deployment:

1. **Zero-Downtime Updates:** The health monitoring service tracks state in memory, so each deployment starts fresh
2. **Configuration Changes:** Update environment variables in both blue and green environments before switching
3. **Monitoring:** Watch the health endpoint during deployment to ensure services are healthy before switching traffic

## Support

For persistent issues:

1. Check API logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test services individually using the integration test script:
   ```bash
   ./scripts/test-external-services.sh
   ```
4. Review the service-specific documentation in `/docs/`
