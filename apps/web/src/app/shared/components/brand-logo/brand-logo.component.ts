import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  template: `
    <img
      [src]="variant === 'mark' ? markSrc : fullSrc"
      [alt]="alt"
      [class]="className"
      [attr.loading]="loading"
      [attr.decoding]="decoding"
    >
  `,
})
export class BrandLogoComponent {
  @Input() variant: 'full' | 'mark' = 'full';
  @Input() alt = 'NaijasPride';
  @Input() className = '';
  @Input() loading: 'eager' | 'lazy' = 'eager';
  @Input() decoding: 'auto' | 'sync' | 'async' = 'async';

  readonly fullSrc = 'assets/images/logo-full.png';
  readonly markSrc = 'assets/icons/android-chrome-192x192.png';
}
