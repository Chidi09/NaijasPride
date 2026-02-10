type SourceMetrics = {
  fetcherUsed: Record<string, number>;
  challengeDetected: number;
  parseEmptyPages: number;
  errors: number;
};

const DEFAULT_METRICS = (): SourceMetrics => ({
  fetcherUsed: {},
  challengeDetected: 0,
  parseEmptyPages: 0,
  errors: 0,
});

export class SourceMetricsStore {
  private readonly metricsBySource = new Map<string, SourceMetrics>();

  incrementFetcherUsage(sourceId: string, fetcherId: string): void {
    const metrics = this.ensureSource(sourceId);
    metrics.fetcherUsed[fetcherId] = (metrics.fetcherUsed[fetcherId] || 0) + 1;
  }

  incrementChallengeDetected(sourceId: string): void {
    const metrics = this.ensureSource(sourceId);
    metrics.challengeDetected += 1;
  }

  incrementParseEmptyPages(sourceId: string): void {
    const metrics = this.ensureSource(sourceId);
    metrics.parseEmptyPages += 1;
  }

  incrementError(sourceId: string): void {
    const metrics = this.ensureSource(sourceId);
    metrics.errors += 1;
  }

  getSourceSnapshot(sourceId: string): SourceMetrics {
    const metrics = this.metricsBySource.get(sourceId);
    if (!metrics) {
      return DEFAULT_METRICS();
    }

    return {
      fetcherUsed: { ...metrics.fetcherUsed },
      challengeDetected: metrics.challengeDetected,
      parseEmptyPages: metrics.parseEmptyPages,
      errors: metrics.errors,
    };
  }

  private ensureSource(sourceId: string): SourceMetrics {
    const existing = this.metricsBySource.get(sourceId);
    if (existing) return existing;

    const created = DEFAULT_METRICS();
    this.metricsBySource.set(sourceId, created);
    return created;
  }
}

export const sourceMetrics = new SourceMetricsStore();
