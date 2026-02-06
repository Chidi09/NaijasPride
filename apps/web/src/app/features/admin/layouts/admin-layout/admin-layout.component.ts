import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-screen bg-gray-100 flex">
      <aside class="w-64 bg-gray-900 text-white flex flex-col fixed inset-y-0 left-0 z-20">
        <div class="p-6 border-b border-gray-800">
          <h2 class="text-xl font-bold tracking-wider text-green-400">ADMIN</h2>
        </div>
        
        <nav class="flex-grow p-4 space-y-2">
          <a 
            routerLink="/admin/dashboard" 
            routerLinkActive="bg-primary text-white" 
            class="flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
          >
            <span>📊</span> Dashboard
          </a>
          <a 
            routerLink="/admin/movies" 
            routerLinkActive="bg-primary text-white" 
            class="flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
          >
            <span>🎬</span> Movies
          </a>
          <a href="#" class="flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-gray-800 hover:text-white rounded-lg transition-colors opacity-50 cursor-not-allowed">
            <span>📚</span> Books (Soon)
          </a>
        </nav>

        <div class="p-4 border-t border-gray-800">
          <a routerLink="/" class="flex items-center gap-2 text-sm text-gray-500 hover:text-white">
            <span>←</span> Back to Site
          </a>
        </div>
      </aside>

      <main class="flex-grow ml-64 p-8">
        <router-outlet />
      </main>
    </div>
  `
})
export class AdminLayoutComponent {}
