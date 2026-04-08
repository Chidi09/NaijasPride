import { Component, input } from "@angular/core";

/**
 * Branded Check Icon - replaces ✓✓✅ emojis
 * Used for success states, verified indicators
 */
@Component({
  selector: "app-check-icon",
  standalone: true,
  template: `
    <svg
      [class]="className()"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.fill]="fillColor()"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill-rule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clip-rule="evenodd"
      />
    </svg>
  `,
})
export class CheckIconComponent {
  size = input<number>(24);
  fillColor = input<string>("currentColor");
  className = input<string>("");
}
