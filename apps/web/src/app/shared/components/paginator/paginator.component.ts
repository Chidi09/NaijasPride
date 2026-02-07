import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-paginator',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (totalPages > 1) {
      <div class="flex items-center justify-center gap-2 mt-12 mb-8 select-none">
        
        <button 
          (click)="changePage(currentPage - 1)"
          [disabled]="currentPage === 1"
          class="px-4 py-2 rounded-sm border border-white/10 text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors font-serif"
        >
          PREV
        </button>

        <div class="flex gap-1">
          @for (page of visiblePages; track page) {
            <button 
              (click)="changePage(page)"
              class="w-10 h-10 flex items-center justify-center rounded-sm text-sm font-medium transition-all"
              [class.bg-cinema-500]="currentPage === page"
              [class.text-white]="currentPage === page"
              [class.text-gray-400]="currentPage !== page"
              [class.hover:bg-white/5]="currentPage !== page"
            >
              {{ page }}
            </button>
          }
        </div>

        <button 
          (click)="changePage(currentPage + 1)"
          [disabled]="currentPage === totalPages"
          class="px-4 py-2 rounded-sm border border-white/10 text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors font-serif"
        >
          NEXT
        </button>
      </div>
    }
  `
})
export class PaginatorComponent {
  @Input() currentPage = 1;
  @Input() totalPages = 1;
  @Output() pageChange = new EventEmitter<number>();

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.pageChange.emit(page);
    }
  }

  // Logic to show a window of pages
  get visiblePages(): number[] {
    const delta = 2;
    const range: number[] = [];
    
    // Calculate range around current page
    const start = Math.max(2, this.currentPage - delta);
    const end = Math.min(this.totalPages - 1, this.currentPage + delta);
    
    for (let i = start; i <= end; i++) {
      range.push(i);
    }

    const result: number[] = [];
    
    // Always show first page
    result.push(1);
    
    // Add separator if needed
    if (start > 2) {
      result.push(-1); // Ellipsis separator
    }
    
    // Add middle pages
    result.push(...range);
    
    // Add separator if needed
    if (end < this.totalPages - 1) {
      result.push(-1); // Ellipsis separator
    }
    
    // Always show last page if there's more than one page
    if (this.totalPages > 1) {
      result.push(this.totalPages);
    }
    
    return result;
  }
}
