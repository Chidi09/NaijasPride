import { Component, inject, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Book, PaginationMeta } from '@naijaspride/types';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';

@Component({
  selector: 'app-book-list',
  standalone: true,
  imports: [CommonModule, RouterLink, PaginatorComponent, NgOptimizedImage],
  template: `
    <div class="container mx-auto px-4 py-12">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-3xl font-serif text-white">Library</h1>
          <p class="text-gray-400 mt-2">Discover our collection of Nollywood books and magazines</p>
        </div>
        <div class="flex gap-2">
          <a 
            routerLink="/movies" 
            class="px-4 py-2 bg-cinema-800 text-white rounded hover:bg-cinema-700 transition-colors"
          >
            Movies
          </a>
        </div>
      </div>

      @if (isLoading()) {
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          @for (i of [1,2,3,4,5,6,7,8,10]; track i) {
            <div class="bg-cinema-800 rounded-sm aspect-[2/3] animate-pulse"></div>
          }
        </div>
      }

      @if (books().length > 0) {
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          @for (book of books(); track book.id) {
            <a [routerLink]="['/books', book.slug]" class="group">
              <div class="bg-cinema-800 rounded-sm overflow-hidden transition-transform group-hover:scale-105">
                <div class="aspect-[2/3] relative">
                  @if (book.coverUrl) {
                    <img 
                      [ngSrc]="book.coverUrl" 
                      [alt]="book.title"
                      fill
                      sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, 50vw"
                      class="w-full h-full object-cover"
                    >
                  } @else {
                    <div class="w-full h-full bg-cinema-700 flex items-center justify-center">
                      <span class="text-4xl">📚</span>
                    </div>
                  }
                </div>
                <div class="p-4">
                  <h3 class="text-white font-medium text-sm line-clamp-2">{{ book.title }}</h3>
                  <p class="text-gray-400 text-xs mt-1">{{ book.author }}</p>
                  @if (book.year) {
                    <p class="text-gray-500 text-xs mt-1">{{ book.year }}</p>
                  }
                </div>
              </div>
            </a>
          }
        </div>
        
        @if (meta()) {
          <app-paginator 
            [currentPage]="meta()!.page"
            [totalPages]="meta()!.totalPages"
            (pageChange)="onPageChange($event)"
          />
        }
      }

      @if (!isLoading() && books().length === 0) {
        <div class="text-center py-24 text-gray-400">
          <span class="text-6xl">📚</span>
          <p class="text-lg font-serif mt-4">No books available yet.</p>
          <p class="text-gray-500">Check back soon for our growing library.</p>
        </div>
      }
    </div>
  `
})
export class BookListComponent {
  private http = inject(HttpClient);
  
  books = signal<Book[]>([]);
  meta = signal<PaginationMeta | null>(null);
  isLoading = signal(true);
  currentPage = signal(1);

  constructor() {
    this.loadBooks();
  }

  loadBooks() {
    this.isLoading.set(true);
    this.http.get<{ status: string; data: Book[]; meta: PaginationMeta }>(`/api/v1/books?page=${this.currentPage()}`)
      .subscribe({
        next: (response) => {
          this.books.set(response.data);
          this.meta.set(response.meta);
          this.isLoading.set(false);
        },
        error: (error) => {
          console.error('Error loading books:', error);
          this.isLoading.set(false);
        }
      });
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
    this.loadBooks();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
