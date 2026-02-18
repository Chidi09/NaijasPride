import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div class="max-w-3xl mx-auto px-4 py-12">
        <a routerLink="/" class="text-sm text-[#8a756e] hover:text-[#24181b] dark:text-gray-400 dark:hover:text-white transition-colors">← Back</a>

        <h1 class="mt-4 text-3xl md:text-4xl font-serif font-bold text-[#24181b] dark:text-white">{{ title }}</h1>
        <p class="mt-2 text-sm text-[#8a756e] dark:text-gray-500">Last updated: {{ lastUpdated }}</p>

        <div class="mt-8 prose prose-sm max-w-none
          prose-headings:font-serif prose-headings:text-[#24181b] dark:prose-headings:text-white
          prose-p:text-[#5f4d47] dark:prose-p:text-gray-300
          prose-li:text-[#5f4d47] dark:prose-li:text-gray-300
          prose-a:text-[#800020] prose-a:no-underline hover:prose-a:underline
          prose-strong:text-[#24181b] dark:prose-strong:text-white
          prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3
          prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2
          prose-p:leading-relaxed prose-p:mb-4
          prose-ul:pl-5 prose-ul:mb-4 prose-li:mb-1"
          [innerHTML]="html"
        ></div>
      </div>
    </div>
  `
})
export class LegalPageComponent {
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);

  title: string = this.route.snapshot.data['title'] || 'Legal';
  lastUpdated: string = this.route.snapshot.data['lastUpdated'] || 'February 2026';
  html: SafeHtml = this.sanitizer.bypassSecurityTrustHtml(
    this.route.snapshot.data['html'] || ''
  );
}
