import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";

@Component({
  selector: "app-static-page",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div class="container mx-auto px-4 py-12">
        <a
          routerLink="/"
          class="text-sm text-[#8a756e] hover:text-[#24181b] dark:text-gray-400 dark:hover:text-white transition-colors"
          >← Back</a
        >
        <h1 class="mt-4 text-3xl md:text-4xl font-serif">{{ title }}</h1>

        <div
          class="mt-6 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg p-6 md:p-8"
        >
          <p
            class="text-[var(--text-secondary)] leading-relaxed whitespace-pre-line"
          >
            {{ body }}
          </p>
        </div>
      </div>
    </div>
  `,
})
export class StaticPageComponent {
  private route = inject(ActivatedRoute);

  title: string = (this.route.snapshot.data["title"] as string) || "Info";
  body: string =
    (this.route.snapshot.data["body"] as string) ||
    "This page is being prepared.";
}
