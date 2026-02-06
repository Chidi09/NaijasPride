import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="min-h-screen flex flex-col">
      <header class="bg-primary text-white p-4 shadow-md sticky top-0 z-50">
        <div class="container mx-auto flex justify-between items-center">
          <h1 class="text-2xl font-bold tracking-tight">NaijasPride</h1>
          <nav>
            <a href="#" class="hover:text-accent transition-colors">Movies</a>
          </nav>
        </div>
      </header>
      
      <main class="flex-grow container mx-auto p-4">
        <router-outlet />
      </main>

      <footer class="bg-gray-900 text-gray-400 p-6 text-center text-sm">
        © 2026 NaijasPride. Made with ❤️ in Lagos.
      </footer>
    </div>
  `,
})
export class AppComponent {}
