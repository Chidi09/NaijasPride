import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterOutlet, RouterLink, RouterLinkActive } from "@angular/router";
import { BrandLogoComponent } from "../../../../shared/components/brand-logo/brand-logo.component";

@Component({
  selector: "app-admin-layout",
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    BrandLogoComponent,
  ],
  template: `
    <div
      class="min-h-screen bg-cinema-900 text-cinema-50 flex"
      style="--cinema-900: 10 10 10; --cinema-800: 18 18 18; --cinema-700: 30 30 30; --cinema-500: 128 0 32; --cinema-400: 163 21 53; --cinema-100: 245 245 220; --cinema-50: 249 249 242;"
    >
      <aside
        class="w-72 bg-[#0f0f11] text-white flex flex-col fixed inset-y-0 left-0 z-30 border-r border-[#2d1a21]"
      >
        <div class="p-6 border-b border-[#2d1a21]">
          <app-brand-logo
            variant="full"
            alt="NaijasPride Admin"
            className="h-8 w-auto max-w-[180px] object-contain"
          />
          <p class="text-xs uppercase tracking-[0.25em] text-[#9f7d73] mt-2">
            Admin Console
          </p>
        </div>

        <nav class="flex-grow p-4 space-y-2">
          <a
            routerLink="/admin/dashboard"
            routerLinkActive="bg-cinema-500 text-white"
            class="flex items-center gap-3 px-4 py-3 text-[#b59c95] hover:bg-[#22161b] hover:text-white rounded-lg transition-colors"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
                d="M4 13h4v7H4zm6-9h4v16h-4zm6 5h4v11h-4z"
              />
            </svg>
            Dashboard
          </a>
          <a
            routerLink="/admin/movies"
            routerLinkActive="bg-cinema-500 text-white"
            class="flex items-center gap-3 px-4 py-3 text-[#b59c95] hover:bg-[#22161b] hover:text-white rounded-lg transition-colors"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
                d="M7 4v16M17 4v16M3 8h18M3 16h18"
              />
            </svg>
            Movies
          </a>
          <a
            routerLink="/admin/movies/upload"
            routerLinkActive="bg-cinema-500 text-white"
            class="flex items-center gap-3 px-4 py-3 text-[#b59c95] hover:bg-[#22161b] hover:text-white rounded-lg transition-colors group"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span>Upload Movie</span>
            <span
              class="ml-auto text-[10px] bg-cinema-500/20 text-cinema-400 px-1.5 py-0.5 rounded border border-cinema-500/30 opacity-0 group-hover:opacity-100 transition-opacity"
              >NEW</span
            >
          </a>
          <a
            routerLink="/admin/movies/new"
            routerLinkActive="bg-cinema-500 text-white"
            class="flex items-center gap-3 px-4 py-3 text-[#b59c95] hover:bg-[#22161b] hover:text-white rounded-lg transition-colors"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
                d="M12 5v14m-7-7h14"
              />
            </svg>
            Add External Link
          </a>
          <a
            routerLink="/admin/discovery"
            routerLinkActive="bg-cinema-500 text-white"
            class="flex items-center gap-3 px-4 py-3 text-[#b59c95] hover:bg-[#22161b] hover:text-white rounded-lg transition-colors"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
                d="M3 10l9-6 9 6-9 6-9-6zm0 4l9 6 9-6"
              />
            </svg>
            Discovery
          </a>
          <a
            routerLink="/admin/books"
            routerLinkActive="bg-cinema-500 text-white"
            class="flex items-center gap-3 px-4 py-3 text-[#b59c95] hover:bg-[#22161b] hover:text-white rounded-lg transition-colors"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
                d="M4 5a2 2 0 012-2h11a3 3 0 013 3v13H6a2 2 0 00-2 2V5z"
              />
            </svg>
            Books & Comics
          </a>
          <a
            routerLink="/admin/users"
            routerLinkActive="bg-cinema-500 text-white"
            class="flex items-center gap-3 px-4 py-3 text-[#b59c95] hover:bg-[#22161b] hover:text-white rounded-lg transition-colors"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
              />
            </svg>
            Users
          </a>
          <a
            routerLink="/admin/queues"
            routerLinkActive="bg-cinema-500 text-white"
            class="flex items-center gap-3 px-4 py-3 text-[#b59c95] hover:bg-[#22161b] hover:text-white rounded-lg transition-colors"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Job Queues
          </a>
        </nav>

        <div class="p-4 border-t border-[#2d1a21]">
          <a
            routerLink="/"
            class="flex items-center gap-2 text-sm text-[#8f7a74] hover:text-white transition-colors"
          >
            <span>←</span> Back to Site
          </a>
        </div>
      </aside>

      <main class="flex-grow ml-72 p-8">
        <header
          class="mb-6 rounded-xl border border-[#2d1a21] bg-[#140d11] px-6 py-4 flex items-center justify-between"
        >
          <div>
            <p class="text-xs uppercase tracking-[0.22em] text-[#9f7d73]">
              Operations
            </p>
            <h1 class="text-xl font-semibold text-white">
              Content Administration
            </h1>
          </div>
          <div class="text-right">
            <p class="text-xs text-[#9f7d73]">Environment</p>
            <p class="text-sm text-[#d6b87a]">Production-ready workflow</p>
          </div>
        </header>
        <router-outlet />
      </main>
    </div>
  `,
})
export class AdminLayoutComponent {}
