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
