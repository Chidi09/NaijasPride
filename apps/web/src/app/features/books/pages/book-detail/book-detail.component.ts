import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Book } from '@naijaspride/types';

@Component({
  selector: 'app-book-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (book(); as book) {
      <div class="container mx-auto px-4 py-12">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <!-- Book Cover -->
          <div class="md:col-span-1">
            <div class="sticky top-24">
              @if (book.coverUrl) {
                <img 
                  [src]="book.coverUrl" 
                  [alt]="book.title"
                  class="w-full rounded-lg shadow-2xl"
                >
              } @else {
                <div class="aspect-[2/3] bg-cinema-800 rounded-lg flex items-center justify-center">
                  <span class="text-6xl">📚</span>
                </div>
              }
              
              @if (book.downloadUrl) {
                <a 
                  [href]="book.downloadUrl"
                  target="_blank"
                  class="mt-6 block w-full bg-cinema-500 text-white text-center py-3 rounded-lg font-bold hover:bg-cinema-400 transition-colors"
                >
                  Download {{ book.format || 'PDF' }}
                  @if (book.fileSize) {
                    <span class="text-sm font-normal block mt-1">
                      {{ formatFileSize(book.fileSize) }}
                    </span>
                  }
                </a>
              }
            </div>
          </div>
          
          <!-- Book Details -->
          <div class="md:col-span-2">
            <a routerLink="/books" class="text-gray-400 hover:text-white transition-colors mb-4 inline-block">
              ← Back to Library
            </a>
            
            <h1 class="text-3xl md:text-4xl font-serif text-white mb-2">{{ book.title }}</h1>
            <p class="text-xl text-gray-400 mb-6">by {{ book.author }}</p>
            
            <div class="flex flex-wrap gap-4 mb-8 text-sm text-gray-400">
              @if (book.year) {
                <span>{{ book.year }}</span>
              }
              @if (book.publisher) {
                <span>• {{ book.publisher }}</span>
              }
              @if (book.pageCount) {
                <span>• {{ book.pageCount }} pages</span>
              }
              @if (book.language) {
                <span>• {{ book.language }}</span>
              }
            </div>
            
            @if (book.genre?.length) {
              <div class="flex flex-wrap gap-2 mb-8">
                @for (genre of book.genre; track genre) {
                  <span class="bg-cinema-800 text-gray-300 text-sm px-3 py-1 rounded-full">
                    {{ genre }}
                  </span>
                }
              </div>
            }
            
            @if (book.description) {
              <div class="bg-cinema-800/50 rounded-lg p-6">
                <h2 class="text-lg font-bold text-white mb-4">Description</h2>
                <p class="text-gray-400 leading-relaxed">{{ book.description }}</p>
              </div>
            }
            
            @if (book.isbn) {
              <div class="mt-6 text-gray-500 text-sm">
                ISBN: {{ book.isbn }}
              </div>
            }
          </div>
        </div>
      </div>
    } @else {
      <div class="container mx-auto px-4 py-24 text-center text-gray-400">
        <p>Loading...</p>
      </div>
    }
  `
})
export class BookDetailComponent {
  slug = input.required<string>();
  private http = inject(HttpClient);
  
  book = inject(HttpClient).get<{ status: string; data: Book }>(`/api/books/${this.slug()}`)
    .subscribe({
      next: (response) => response.data,
      error: (error) => {
        console.error('Error loading book:', error);
        return null;
      }
    });
  
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
