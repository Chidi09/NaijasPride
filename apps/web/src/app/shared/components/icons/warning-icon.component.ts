import { Component, input } from "@angular/core";

/**
 * Branded Warning/Alert Icon - replaces ⚠️ emoji
 * Used for alerts, unverified states, caution messages
 */
@Component({
  selector: "app-warning-icon",
  standalone: true,
  template: `
    <svg
      [class]="className()"
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
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  `,
})
export class WarningIconComponent {
  size = input<number>(20);
  strokeColor = input<string>("currentColor");
  className = input<string>("");
}
