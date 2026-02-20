import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, switchMap, startWith } from 'rxjs';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
  isPremium: boolean;
  emailVerified: boolean;
  subStatus: string;
  subStartDate: string | null;
  nextBillingDate: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    watchlist: number;
    downloadHistory: number;
    watchHistory: number;
  };
}

interface UsersResponse {
  status: string;
  data: User[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface UserStats {
  total: number;
  admins: number;
  premium: number;
  verified: number;
  recentSignups: number;
}

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="space-y-6">
      <!-- Stats Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        @for (stat of stats(); track stat.label) {
          <div class="bg-[#140d11] border border-[#2d1a21] rounded-lg p-4">
            <p class="text-xs uppercase tracking-wider text-[#9f7d73]">{{ stat.label }}</p>
            <p class="text-2xl font-bold text-white mt-1">{{ stat.value | number }}</p>
          </div>
        }
      </div>

      <!-- Filters -->
      <div class="bg-[#140d11] border border-[#2d1a21] rounded-lg p-4">
        <form [formGroup]="filterForm" class="flex flex-wrap gap-4 items-end">
          <div class="flex-grow max-w-md">
            <label class="block text-xs uppercase tracking-wider text-[#9f7d73] mb-1">Search</label>
            <input
              type="text"
              formControlName="search"
              placeholder="Email or name..."
              class="w-full bg-[#0f0f11] border border-[#2d1a21] rounded px-3 py-2 text-white placeholder-[#6f5b54] focus:border-cinema-500 focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-xs uppercase tracking-wider text-[#9f7d73] mb-1">Role</label>
            <select
              formControlName="role"
              class="bg-[#0f0f11] border border-[#2d1a21] rounded px-3 py-2 text-white focus:border-cinema-500 focus:outline-none"
            >
              <option value="">All Roles</option>
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div>
            <label class="block text-xs uppercase tracking-wider text-[#9f7d73] mb-1">Premium</label>
            <select
              formControlName="isPremium"
              class="bg-[#0f0f11] border border-[#2d1a21] rounded px-3 py-2 text-white focus:border-cinema-500 focus:outline-none"
            >
              <option value="">All</option>
              <option value="true">Premium</option>
              <option value="false">Free</option>
            </select>
          </div>
        </form>
      </div>

      <!-- Users Table -->
      <div class="bg-[#140d11] border border-[#2d1a21] rounded-lg overflow-hidden">
        @if (loading) {
          <div class="p-8 text-center text-[#9f7d73]">
            <div class="inline-block w-6 h-6 border-2 border-cinema-500 border-t-transparent rounded-full animate-spin"></div>
            <p class="mt-2">Loading users...</p>
          </div>
        } @else if (error) {
          <div class="p-8 text-center text-red-400">{{ error }}</div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-[#0f0f11] border-b border-[#2d1a21]">
                <tr>
                  <th class="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9f7d73]">User</th>
                  <th class="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9f7d73]">Role</th>
                  <th class="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9f7d73]">Status</th>
                  <th class="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9f7d73]">Subscription</th>
                  <th class="text-left px-4 py-3 text-xs uppercase tracking-wider text-[#9f7d73]">Activity</th>
                  <th class="text-right px-4 py-3 text-xs uppercase tracking-wider text-[#9f7d73]">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#2d1a21]">
                @for (user of users; track user.id) {
                  <tr class="hover:bg-[#1a1116] transition-colors">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-cinema-500/20 flex items-center justify-center text-cinema-100 text-sm font-bold">
                          {{ getInitials(user.name || user.email) }}
                        </div>
                        <div>
                          <p class="text-white font-medium">{{ user.name || 'Unnamed User' }}</p>
                          <p class="text-sm text-[#9f7d73]">{{ user.email }}</p>
                          @if (!user.emailVerified) {
                            <span class="inline-block mt-1 text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">Unverified</span>
                          }
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <select
                        [value]="user.role"
                        (change)="updateRole(user.id, $event)"
                        class="bg-[#0f0f11] border border-[#2d1a21] rounded px-2 py-1 text-sm text-white focus:border-cinema-500 focus:outline-none"
                        [disabled]="updatingUser === user.id"
                      >
                        <option value="USER">User</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                    <td class="px-4 py-3">
                      @if (user.role === 'ADMIN') {
                        <span class="inline-flex items-center gap-1 text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded">
                          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                          Admin
                        </span>
                      } @else {
                        <span class="text-sm text-[#9f7d73]">Member</span>
                      }
                    </td>
                    <td class="px-4 py-3">
                      @if (user.isPremium) {
                        <span class="inline-flex items-center gap-1 text-xs bg-cinema-500/20 text-cinema-100 px-2 py-1 rounded">
                          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 5a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1V8a1 1 0 011-1zm5-5a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0V6h-1a1 1 0 110-2h1V3a1 1 0 011-1zm0 5a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1V8a1 1 0 011-1z" clip-rule="evenodd"/></svg>
                          PRO
                        </span>
                        <p class="text-xs text-[#9f7d73] mt-1">{{ getDaysRemaining(user.nextBillingDate) }}</p>
                      } @else {
                        <span class="text-xs text-[#6f5b54]">Free Plan</span>
                      }
                    </td>
                    <td class="px-4 py-3">
                      <div class="text-sm text-[#9f7d73] space-y-0.5">
                        <p>{{ user._count.watchlist }} in watchlist</p>
                        <p>{{ user._count.watchHistory }} watched</p>
                        <p>{{ user._count.downloadHistory }} downloads</p>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-right">
                      <button
                        (click)="togglePremium(user)"
                        [disabled]="updatingUser === user.id"
                        class="text-xs px-2 py-1 rounded mr-2 transition-colors"
                        [class.bg-cinema-500]="!user.isPremium"
                        [class.text-white]="!user.isPremium"
                        [class.bg-[#2d1a21]]="user.isPremium"
                        [class.text-[#9f7d73]]="user.isPremium"
                        [class.hover:bg-cinema-400]="!user.isPremium"
                        [class.hover:bg-[#3d2a31]]="user.isPremium"
                      >
                        {{ user.isPremium ? 'Remove PRO' : 'Make PRO' }}
                      </button>
                      <button
                        (click)="deleteUser(user.id)"
                        [disabled]="updatingUser === user.id"
                        class="text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 px-2 py-1 rounded transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          @if (meta; as m) {
            <div class="flex items-center justify-between px-4 py-3 border-t border-[#2d1a21]">
              <p class="text-sm text-[#9f7d73]">
                Showing {{ (m.page - 1) * m.limit + 1 }} - {{ Math.min(m.page * m.limit, m.total) }} of {{ m.total }}
              </p>
              <div class="flex gap-2">
                <button
                  (click)="goToPage(m.page - 1)"
                  [disabled]="!m.hasPrev || loading"
                  class="px-3 py-1 text-sm bg-[#0f0f11] border border-[#2d1a21] rounded text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#1a1116]"
                >
                  Previous
                </button>
                <button
                  (click)="goToPage(m.page + 1)"
                  [disabled]="!m.hasNext || loading"
                  class="px-3 py-1 text-sm bg-[#0f0f11] border border-[#2d1a21] rounded text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#1a1116]"
                >
                  Next
                </button>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `
})
export class AdminUsersComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  filterForm = this.fb.group({
    search: [''],
    role: [''],
    isPremium: [''],
  });

  users: User[] = [];
  meta: UsersResponse['meta'] | null = null;
  statsData: UserStats | null = null;
  loading = false;
  error: string | null = null;
  updatingUser: string | null = null;

  ngOnInit() {
    this.loadStats();
    this.loadUsers();

    this.filterForm.valueChanges.pipe(
      debounceTime(300),
      startWith(this.filterForm.value)
    ).subscribe(() => {
      this.loadUsers(1);
    });
  }

  loadStats() {
    this.http.get<{ data: UserStats }>('/api/v1/admin/users/stats').subscribe({
      next: (res) => {
        this.statsData = res.data;
      },
    });
  }

  loadUsers(page = 1) {
    this.loading = true;
    this.error = null;

    const params: any = { page, limit: 20 };
    const filters = this.filterForm.value;

    if (filters.search) params.search = filters.search;
    if (filters.role) params.role = filters.role;
    if (filters.isPremium !== '') params.isPremium = filters.isPremium === 'true';

    this.http.get<UsersResponse>('/api/v1/admin/users', { params }).subscribe({
      next: (res) => {
        this.users = res.data;
        this.meta = res.meta;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to load users';
        this.loading = false;
      },
    });
  }

  goToPage(page: number) {
    if (this.meta && page >= 1 && page <= this.meta.totalPages) {
      this.loadUsers(page);
    }
  }

  updateRole(userId: string, event: Event) {
    const role = (event.target as HTMLSelectElement).value as 'USER' | 'ADMIN';
    this.updatingUser = userId;

    this.http.patch(`/api/v1/admin/users/${userId}`, { role }).subscribe({
      next: () => {
        this.updatingUser = null;
        this.loadUsers(this.meta?.page || 1);
      },
      error: (err) => {
        this.updatingUser = null;
        alert(err.error?.message || 'Failed to update role');
      },
    });
  }

  togglePremium(user: User) {
    this.updatingUser = user.id;

    this.http.patch(`/api/v1/admin/users/${user.id}`, {
      isPremium: !user.isPremium,
      subStatus: user.isPremium ? 'inactive' : 'active',
    }).subscribe({
      next: () => {
        this.updatingUser = null;
        this.loadUsers(this.meta?.page || 1);
        this.loadStats();
      },
      error: (err) => {
        this.updatingUser = null;
        alert(err.error?.message || 'Failed to update subscription');
      },
    });
  }

  deleteUser(userId: string) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    this.updatingUser = userId;

    this.http.delete(`/api/v1/admin/users/${userId}`).subscribe({
      next: () => {
        this.updatingUser = null;
        this.loadUsers(this.meta?.page || 1);
        this.loadStats();
      },
      error: (err) => {
        this.updatingUser = null;
        alert(err.error?.message || 'Failed to delete user');
      },
    });
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  getDaysRemaining(date: string | null): string {
    if (!date) return '';
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days > 0 ? `${days} days left` : 'Expired';
  }

  stats() {
    if (!this.statsData) return [];
    return [
      { label: 'Total Users', value: this.statsData.total },
      { label: 'Admins', value: this.statsData.admins },
      { label: 'Premium', value: this.statsData.premium },
      { label: 'New (30d)', value: this.statsData.recentSignups },
    ];
  }

  protected readonly Math = Math;
}
