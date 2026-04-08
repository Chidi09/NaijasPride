import { Component, input } from "@angular/core";

/**
 * Branded Play Icon - replaces ▶ emoji
 * Used for watch now buttons, video controls
 */
@Component({
  selector: "app-play-icon",
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
      <path d="M8 5v14l11-7z" />
    </svg>
  `,
})
export class PlayIconComponent {
  size = input<number>(24);
  fillColor = input<string>("currentColor");
  className = input<string>("");
}
