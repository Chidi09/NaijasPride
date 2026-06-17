import { Component, OnDestroy, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { RouterLink } from "@angular/router";
import { AuthService } from "../../../core/auth/auth.service";

interface AppNotification {
  id: string;
  type: "COMMENT_REPLY" | "COMMENT_MENTION" | "DOWNLOAD_READY";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, string>;
}

@Component({
  selector: "app-notification-bell",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (auth.currentUser()) {
      <div class="relative" (clickOutside)="closeDropdown()">
        <!-- Bell button -->
        <button
          type="button"
          (click)="toggleDropdown()"
          class="relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-black/20 text-black/75 hover:text-black hover:border-black/35 dark:border-white/20 dark:text-white/80 dark:hover:text-white dark:hover:border-white/40 transition-colors"
          aria-label="Notifications"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          @if (unreadCount() > 0) {
            <span
              class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
            >
              {{ unreadCount() > 99 ? "99+" : unreadCount() }}
            </span>
          }
        </button>

        <!-- Dropdown -->
        @if (dropdownOpen()) {
          <div
            class="absolute right-0 top-full mt-2 w-80 rounded-lg border border-black/15 bg-white/98 dark:border-white/15 dark:bg-[#111] shadow-xl z-[70] overflow-hidden"
            (click)="$event.stopPropagation()"
          >
            <!-- Header -->
            <div
              class="flex items-center justify-between px-4 py-3 border-b border-black/10 dark:border-white/10"
            >
              <span class="text-sm font-semibold text-black dark:text-white"
                >Notifications</span
              >
              @if (unreadCount() > 0) {
                <button
                  type="button"
                  (click)="markAllRead()"
                  class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Mark all read
                </button>
              }
            </div>

            <!-- List -->
            <div class="max-h-96 overflow-y-auto">
              @if (loading()) {
                <div class="px-4 py-6 text-center">
                  <span
                    class="w-5 h-5 border-2 border-black/20 dark:border-white/20 border-t-black dark:border-t-white rounded-full animate-spin inline-block"
                  ></span>
                </div>
              } @else if (notifications().length === 0) {
                <div
                  class="px-4 py-8 text-center text-sm text-black/50 dark:text-white/50"
                >
                  No notifications yet
                </div>
              } @else {
                @for (notif of notifications(); track notif.id) {
                  <div
                    class="px-4 py-3 border-b border-black/5 dark:border-white/5 last:border-0 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    [ngClass]="{
                      'bg-blue-50/60 dark:bg-blue-950/30': !notif.read,
                    }"
                    (click)="markRead(notif)"
                  >
                    <div class="flex items-start gap-3">
                      <!-- Icon -->
                      <div
                        class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5"
                        [ngClass]="{
                          'bg-green-100 dark:bg-green-900/40':
                            notif.type === 'DOWNLOAD_READY',
                          'bg-blue-100 dark:bg-blue-900/40':
                            notif.type === 'COMMENT_REPLY',
                          'bg-purple-100 dark:bg-purple-900/40':
                            notif.type === 'COMMENT_MENTION',
                        }"
                      >
                        @if (notif.type === "DOWNLOAD_READY") {
                          <svg
                            class="w-4 h-4 text-green-600 dark:text-green-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                        } @else if (notif.type === "COMMENT_REPLY") {
                          <svg
                            class="w-4 h-4 text-blue-600 dark:text-blue-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                            />
                          </svg>
                        } @else {
                          <svg
                            class="w-4 h-4 text-purple-600 dark:text-purple-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        }
                      </div>

                      <div class="flex-1 min-w-0">
                        <p
                          class="text-sm font-semibold text-black dark:text-white leading-tight"
                        >
                          {{ notif.title }}
                        </p>
                        <p
                          class="text-xs text-black/60 dark:text-white/60 mt-0.5 line-clamp-2"
                        >
                          {{ notif.body }}
                        </p>
                        <p
                          class="text-[10px] text-black/40 dark:text-white/40 mt-1"
                        >
                          {{ timeAgo(notif.createdAt) }}
                        </p>
                      </div>

                      @if (!notif.read) {
                        <div
                          class="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1.5"
                        ></div>
                      }
                    </div>
                  </div>
                }
              }
            </div>

            <!-- Footer -->
            <div
              class="px-4 py-2 border-t border-black/10 dark:border-white/10 text-center"
            >
              <a
                routerLink="/profile"
                (click)="closeDropdown()"
                class="text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors"
              >
                View all in profile
              </a>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  auth = inject(AuthService);

  unreadCount = signal(0);
  dropdownOpen = signal(false);
  notifications = signal<AppNotification[]>([]);
  loading = signal(false);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private docClickHandler = (e: MouseEvent) => {
    const host = (e.target as HTMLElement)?.closest("app-notification-bell");
    if (!host) this.closeDropdown();
  };

  ngOnInit() {
    if (this.auth.currentUser()) {
      this.fetchUnreadCount();
      this.pollTimer = setInterval(() => this.fetchUnreadCount(), 60_000);
      document.addEventListener("click", this.docClickHandler, true);
    }
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    document.removeEventListener("click", this.docClickHandler, true);
  }

  private fetchUnreadCount() {
    this.http
      .get<{ data: { count: number } }>("/api/v1/notifications/unread-count")
      .subscribe({
        next: (res) => this.unreadCount.set(res.data.count),
        error: () => {},
      });
  }

  toggleDropdown() {
    const next = !this.dropdownOpen();
    this.dropdownOpen.set(next);
    if (next && this.notifications().length === 0) {
      this.fetchNotifications();
    }
  }

  closeDropdown() {
    this.dropdownOpen.set(false);
  }

  private fetchNotifications() {
    this.loading.set(true);
    this.http
      .get<{ data: AppNotification[] }>("/api/v1/notifications?limit=20")
      .subscribe({
        next: (res) => {
          this.notifications.set(res.data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  markRead(notif: AppNotification) {
    if (notif.read) return;
    this.http.patch(`/api/v1/notifications/${notif.id}/read`, {}).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      },
      error: () => {},
    });
  }

  markAllRead() {
    this.http.patch("/api/v1/notifications/read-all", {}).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((n) => ({ ...n, read: true })),
        );
        this.unreadCount.set(0);
      },
      error: () => {},
    });
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }
}
