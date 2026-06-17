import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output, inject } from "@angular/core";
import { Location } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";

@Component({
  selector: "app-reader-toolbar",
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
  styles: [
    `
      .np-toolbar-wrap {
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--np-reader-surface) 94%, transparent) 0%,
          color-mix(in srgb, var(--np-reader-surface) 22%, transparent) 66%,
          transparent 100%
        );
        backdrop-filter: blur(10px);
        border-bottom: 1px solid
          color-mix(in srgb, var(--np-reader-border) 85%, transparent);
      }
      .np-toolbar-back {
        background: color-mix(in srgb, var(--np-reader-bg) 82%, transparent);
        border: 1px solid var(--np-reader-border);
        color: var(--np-reader-fg);
        border-radius: 999px;
        padding: 0.42rem 0.92rem;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        font-weight: 600;
        text-decoration: none;
        white-space: nowrap;
      }
      .np-toolbar-back:hover {
        background: color-mix(
          in srgb,
          var(--np-reader-bg) 94%,
          var(--np-reader-accent) 6%
        );
      }
      .np-toolbar-title {
        color: var(--np-reader-fg);
        font-family: "Newsreader", "Times New Roman", Georgia, serif;
        font-size: clamp(0.95rem, 0.86rem + 0.45vw, 1.24rem);
        font-weight: 700;
        letter-spacing: -0.01em;
        font-style: italic;
      }
      .np-toolbar-subtitle {
        color: var(--np-reader-muted);
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        font-family: "Inter", "Segoe UI", system-ui, sans-serif;
      }
      .np-toolbar-btn {
        color: var(--np-reader-fg) !important;
      }
      .np-toolbar-chip {
        border: 1px solid var(--np-reader-border);
        background: color-mix(in srgb, var(--np-reader-bg) 84%, transparent);
        border-radius: 999px;
        padding: 0.35rem 0.8rem;
        color: var(--np-reader-muted);
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-family: "Inter", "Segoe UI", system-ui, sans-serif;
      }
      @media (max-width: 640px) {
        .np-toolbar-wrap {
          padding-inline: 0.65rem;
        }
        .np-toolbar-subtitle,
        .np-toolbar-chip {
          display: none;
        }
        .np-toolbar-back {
          font-size: 10px;
          padding: 0.35rem 0.72rem;
        }
      }
    `,
  ],
  template: `
    <div
      class="np-toolbar-wrap pointer-events-none fixed left-0 right-0 top-0 z-40 px-4 py-3 transition-transform duration-300"
      [class.-translate-y-full]="!show"
    >
      <div
        class="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between gap-3"
      >
        <button type="button" class="np-toolbar-back" (click)="goBack()">
          Back
        </button>

        <div class="min-w-0 text-center">
          <p class="np-toolbar-title truncate text-sm font-semibold">
            {{ title || "Loading..." }}
          </p>
          <p class="np-toolbar-subtitle mt-1 truncate text-[11px]">
            {{ subtitle || "" }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <span class="np-toolbar-chip hidden md:inline">Reader</span>
          <button
            mat-icon-button
            class="np-toolbar-btn"
            type="button"
            (click)="fullscreen.emit()"
            matTooltip="Fullscreen"
          >
            <mat-icon>fullscreen</mat-icon>
          </button>
          <button
            mat-icon-button
            class="np-toolbar-btn"
            type="button"
            (click)="openPanel.emit()"
            matTooltip="Settings & TOC"
          >
            <mat-icon>tune</mat-icon>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ReaderToolbarComponent {
  private location = inject(Location);

  @Input() show = true;
  @Input() title = "";
  @Input() subtitle = "";

  @Output() fullscreen = new EventEmitter<void>();
  @Output() openPanel = new EventEmitter<void>();

  goBack(): void {
    this.location.back();
  }
}
