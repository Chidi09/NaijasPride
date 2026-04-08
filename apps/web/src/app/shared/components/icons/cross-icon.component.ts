import { Component, input } from "@angular/core";

/**
 * Branded Cross/Close Icon - replaces ✕❌ emojis
 * Used for errors, clearing filters, close buttons
 */
@Component({
  selector: "app-cross-icon",
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
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clip-rule="evenodd"
      />
    </svg>
  `,
})
export class CrossIconComponent {
  size = input<number>(24);
  fillColor = input<string>("currentColor");
  className = input<string>("");
}
