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
