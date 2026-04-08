import { Component, input } from "@angular/core";

/**
 * Branded Loading/Spinner Icon - replaces ⟳ emoji
 * Used for loading states, verification in progress
 */
@Component({
  selector: "app-loading-icon",
  standalone: true,
  template: `
    <svg
      [class]="'animate-spin ' + className()"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      [attr.stroke]="strokeColor()"
      stroke-width="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  `,
})
export class LoadingIconComponent {
  size = input<number>(40);
  strokeColor = input<string>("currentColor");
  className = input<string>("");
}
