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
  styles: [`
    .np-toolbar-wrap {
      /* Fixed dark chrome — always visible regardless of reader theme */
      background: linear-gradient(to bottom, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0) 100%);
      backdrop-filter: blur(2px);
    }
    .np-toolbar-back {
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.18);
      color: #f0ede8;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      text-decoration: none;
      white-space: nowrap;
    }
    .np-toolbar-back:hover { background: rgba(255,255,255,0.2); }
    .np-toolbar-title { color: #f0ede8; }
    .np-toolbar-subtitle { color: rgba(240,237,232,0.65); }
    .np-toolbar-btn { color: #f0ede8 !important; }
  `],
  template: `
    <div
      class="np-toolbar-wrap pointer-events-none fixed left-0 right-0 top-0 z-40 px-4 py-3 transition-transform duration-300"
      [class.-translate-y-full]="!show"
    >
      <div class="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <a [routerLink]="backLink" class="np-toolbar-back">Back</a>

        <div class="min-w-0 text-center">
          <p class="np-toolbar-title truncate text-sm font-semibold">{{ title || 'Loading...' }}</p>
          <p class="np-toolbar-subtitle mt-1 truncate text-[11px]">{{ subtitle || '' }}</p>
        </div>

        <div class="flex items-center gap-1">
          <button mat-icon-button class="np-toolbar-btn" type="button" (click)="fullscreen.emit()" matTooltip="Fullscreen">
            <mat-icon>fullscreen</mat-icon>
          </button>
          <button mat-icon-button class="np-toolbar-btn" type="button" (click)="openPanel.emit()" matTooltip="Settings & TOC">
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
