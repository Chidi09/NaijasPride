import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

interface QueueJob {
  id: string;
  name: string;
  data: Record<string, unknown>;
  progress: number;
  attemptsMade: number;
  failedReason?: string;
  stacktrace?: string[];
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

@Component({
  selector: 'app-admin-job-queue',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-8">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-3xl font-bold text-[#24181b] dark:text-white">Job Queue Status</h1>
          <p class="text-[#7b6660] dark:text-gray-400 mt-1">Monitor and manage background processing jobs</p>
        </div>
        <button
          (click)="refreshQueues()"
          [disabled]="loading"
          class="px-4 py-2 bg-[#800020] hover:bg-[#660019] text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50"
        >
          @if (loading) {
            <span class="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full"></span>
          } @else {
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          }
          Refresh
        </button>
      </div>

      @if (error) {
        <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p class="text-red-600 dark:text-red-400">{{ error }}</p>
        </div>
      }

      <!-- Queue Stats Cards -->
      @if (queues.length > 0) {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          @for (queue of queues; track queue.name) {
            <div 
              class="bg-white dark:bg-cinema-800 rounded-xl border border-[#dcc5b8] dark:border-gray-700 p-6 shadow-sm"
              [class.border-yellow-500]="queue.paused"
            >
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-[#24181b] dark:text-white capitalize">{{ queue.name }}</h3>
                <span 
                  class="px-2 py-1 rounded-full text-xs font-medium"
                  [class.bg-green-100]="!queue.paused"
                  [class.text-green-700]="!queue.paused"
                  [class.dark:bg-green-900]="!queue.paused"
                  [class.dark:text-green-300]="!queue.paused"
                  [class.bg-yellow-100]="queue.paused"
                  [class.text-yellow-700]="queue.paused"
                  [class.dark:bg-yellow-900]="queue.paused"
                  [class.dark:text-yellow-300]="queue.paused"
                >
                  {{ queue.paused ? 'Paused' : 'Active' }}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ queue.waiting }}</div>
                  <div class="text-xs text-[#7b6660] dark:text-gray-400">Waiting</div>
                </div>
                <div class="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ queue.active }}</div>
                  <div class="text-xs text-[#7b6660] dark:text-gray-400">Active</div>
                </div>
                <div class="text-center p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
                  <div class="text-2xl font-bold text-gray-600 dark:text-gray-400">{{ queue.completed }}</div>
                  <div class="text-xs text-[#7b6660] dark:text-gray-400">Completed</div>
                </div>
                <div class="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div class="text-2xl font-bold text-red-600 dark:text-red-400">{{ queue.failed }}</div>
                  <div class="text-xs text-[#7b6660] dark:text-gray-400">Failed</div>
                </div>
              </div>

              <div class="flex gap-2">
                @if (queue.paused) {
                  <button
                    (click)="resumeQueue(queue.name)"
                    [disabled]="actionLoading[queue.name]"
                    class="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition disabled:opacity-50"
                  >
                    Resume
                  </button>
                } @else {
                  <button
                    (click)="pauseQueue(queue.name)"
                    [disabled]="actionLoading[queue.name]"
                    class="flex-1 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm transition disabled:opacity-50"
                  >
                    Pause
                  </button>
                }
                
                <button
                  (click)="viewJobs(queue.name)"
                  class="flex-1 px-3 py-2 bg-[#800020] hover:bg-[#660019] text-white rounded-lg text-sm transition"
                >
                  View Jobs
                </button>
              </div>
            </div>
          }
        </div>
      } @else if (!loading && !error) {
        <div class="text-center py-12 bg-white dark:bg-cinema-800 rounded-xl border border-[#dcc5b8] dark:border-gray-700">
          <div class="mb-4"><span class="material-symbols-outlined text-5xl" aria-hidden="true">monitoring</span></div>
          <h3 class="text-lg font-medium text-[#24181b] dark:text-white mb-2">No queues configured</h3>
          <p class="text-[#7b6660] dark:text-gray-400">Redis is not configured or no queues are active.</p>
        </div>
      }

      <!-- Jobs Table -->
      @if (selectedQueue) {
        <div class="bg-white dark:bg-cinema-800 rounded-xl border border-[#dcc5b8] dark:border-gray-700 overflow-hidden">
          <div class="p-4 border-b border-[#dcc5b8] dark:border-gray-700 flex items-center justify-between">
            <h2 class="font-semibold text-[#24181b] dark:text-white">Jobs in {{ selectedQueue }}</h2>
            <div class="flex gap-2">
              <select 
                [(ngModel)]="selectedStatus"
                (change)="loadJobs()"
                class="px-3 py-1.5 rounded-lg border border-[#dcc5b8] dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              >
                <option value="waiting">Waiting</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="delayed">Delayed</option>
              </select>
              
              <button
                (click)="selectedQueue = null"
                class="px-3 py-1.5 text-[#7b6660] dark:text-gray-400 hover:text-[#24181b] dark:hover:text-white transition"
              >
                Close
              </button>
            </div>
          </div>

          @if (jobsLoading) {
            <div class="p-8 text-center">
              <span class="animate-spin h-8 w-8 border-4 border-[#800020] border-t-transparent rounded-full inline-block"></span>
            </div>
          } @else if (jobs.length === 0) {
            <div class="p-8 text-center text-[#7b6660] dark:text-gray-400">
              No {{ selectedStatus }} jobs found
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-[#f1e5dd] dark:bg-black/20">
                  <tr>
                    <th class="p-4 text-left text-[#2a1c1f] dark:text-gray-200">Job ID</th>
                    <th class="p-4 text-left text-[#2a1c1f] dark:text-gray-200">Name</th>
                    <th class="p-4 text-left text-[#2a1c1f] dark:text-gray-200">Progress</th>
                    <th class="p-4 text-left text-[#2a1c1f] dark:text-gray-200">Attempts</th>
                    <th class="p-4 text-left text-[#2a1c1f] dark:text-gray-200">Created</th>
                    <th class="p-4 text-left text-[#2a1c1f] dark:text-gray-200">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[#dcc5b8] dark:divide-gray-700">
                  @for (job of jobs; track job.id) {
                    <tr class="hover:bg-[#f4e4da] dark:hover:bg-white/5 transition-colors">
                      <td class="p-4 text-[#24181b] dark:text-white font-mono text-xs">{{ job.id }}</td>
                      <td class="p-4 text-[#24181b] dark:text-white">{{ job.name }}</td>
                      <td class="p-4">
                        @if (job.progress > 0) {
                          <div class="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div 
                              class="h-full bg-[#800020] transition-all"
                              [style.width.%]="job.progress"
                            ></div>
                          </div>
                          <span class="text-xs text-[#7b6660] dark:text-gray-400">{{ job.progress }}%</span>
                        } @else {
                          <span class="text-xs text-[#7b6660] dark:text-gray-400">-</span>
                        }
                      </td>
                      <td class="p-4 text-[#24181b] dark:text-white">{{ job.attemptsMade }}</td>
                      <td class="p-4 text-[#7b6660] dark:text-gray-400">{{ job.timestamp | date:'short' }}</td>
                      <td class="p-4">
                        <button
                          (click)="removeJob(job.id)"
                          class="text-red-600 hover:text-red-700 text-sm transition"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    </div>
  `
})
export class AdminJobQueueComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private destroy$ = new Subject<void>();
  
  queues: QueueStats[] = [];
  jobs: QueueJob[] = [];
  selectedQueue: string | null = null;
  selectedStatus = 'waiting';
  
  loading = false;
  jobsLoading = false;
  error: string | null = null;
  actionLoading: { [key: string]: boolean } = {};

  ngOnInit() {
    this.refreshQueues();
    // Auto-refresh every 30 seconds
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.selectedQueue) {
          this.refreshQueues();
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refreshQueues() {
    this.loading = true;
    this.error = null;
    
    this.http.get<{ success: boolean; data: QueueStats[]; error?: string }>('/api/v1/admin/queues')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.loading = false;
          if (response.success) {
            this.queues = response.data;
          } else {
            this.error = response.error || 'Failed to load queue stats';
          }
        },
        error: (err) => {
          this.loading = false;
          this.error = err.error?.error || 'Failed to load queue stats';
        }
      });
  }

  pauseQueue(queueName: string) {
    this.actionLoading[queueName] = true;
    this.http.post('/api/v1/admin/queues/' + queueName + '/pause', {})
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoading[queueName] = false;
          this.refreshQueues();
        },
        error: () => {
          this.actionLoading[queueName] = false;
        }
      });
  }

  resumeQueue(queueName: string) {
    this.actionLoading[queueName] = true;
    this.http.post('/api/v1/admin/queues/' + queueName + '/resume', {})
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.actionLoading[queueName] = false;
          this.refreshQueues();
        },
        error: () => {
          this.actionLoading[queueName] = false;
        }
      });
  }

  viewJobs(queueName: string) {
    this.selectedQueue = queueName;
    this.loadJobs();
  }

  loadJobs() {
    if (!this.selectedQueue) return;
    
    this.jobsLoading = true;
    this.http.get<{ success: boolean; data: QueueJob[] }>(`/api/v1/admin/queues/${this.selectedQueue}/jobs?status=${this.selectedStatus}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.jobsLoading = false;
          if (response.success) {
            this.jobs = response.data;
          }
        },
        error: () => {
          this.jobsLoading = false;
        }
      });
  }

  removeJob(jobId: string) {
    if (!this.selectedQueue) return;
    
    this.http.delete(`/api/v1/admin/queues/${this.selectedQueue}/jobs/${jobId}`)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadJobs();
        }
      });
  }
}
