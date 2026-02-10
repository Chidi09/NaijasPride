type CircuitState = 'closed' | 'open' | 'half_open';

export type CircuitBreakerOptions = {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenMaxCalls: number;
};

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30_000,
  halfOpenMaxCalls: 1,
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private openedAt = 0;
  private halfOpenCalls = 0;

  constructor(private readonly options: CircuitBreakerOptions = DEFAULT_OPTIONS) {}

  getState(): CircuitState {
    this.refreshState();
    return this.state;
  }

  canExecute(): boolean {
    this.refreshState();

    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      return false;
    }

    if (this.halfOpenCalls < this.options.halfOpenMaxCalls) {
      this.halfOpenCalls += 1;
      return true;
    }

    return false;
  }

  onSuccess(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.halfOpenCalls = 0;
    this.openedAt = 0;
  }

  onFailure(): void {
    this.failureCount += 1;

    if (this.state === 'half_open') {
      this.trip();
      return;
    }

    if (this.failureCount >= this.options.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.halfOpenCalls = 0;
  }

  private refreshState(): void {
    if (this.state !== 'open') return;

    const elapsed = Date.now() - this.openedAt;
    if (elapsed >= this.options.recoveryTimeoutMs) {
      this.state = 'half_open';
      this.halfOpenCalls = 0;
    }
  }
}
