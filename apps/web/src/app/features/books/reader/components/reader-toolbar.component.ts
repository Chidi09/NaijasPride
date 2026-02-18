import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-reader-toolbar',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <div
      class="pointer-events-none fixed left-0 right-0 top-0 z-40 bg-gradient-to-b from-[var(--np-reader-surface)] to-transparent px-4 py-3 transition-transform duration-300"
      [class.-translate-y-full]="!show"
    >
      <div class="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <a
          [routerLink]="backLink"
          class="rounded border border-[var(--np-reader-border)] bg-[var(--np-reader-surface)] px-3 py-2 text-xs text-[var(--np-reader-fg)] hover:opacity-90"
        >
          Back
        </a>

        <div class="min-w-0 text-center">
          <p class="truncate text-sm font-semibold">{{ title || 'Loading...' }}</p>
          <p class="mt-1 truncate text-[11px] text-[var(--np-reader-muted)]">{{ subtitle || '' }}</p>
        </div>

        <div class="flex items-center gap-1">
          <button mat-icon-button type="button" (click)="fullscreen.emit()" matTooltip="Fullscreen">
            <mat-icon>fullscreen</mat-icon>
          </button>
          <button mat-icon-button type="button" (click)="openPanel.emit()" matTooltip="Settings & TOC">
            <mat-icon>tune</mat-icon>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ReaderToolbarComponent {
  @Input() show = true;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() backLink: string | any[] = '/books/all';

  @Output() fullscreen = new EventEmitter<void>();
  @Output() openPanel = new EventEmitter<void>();
}
