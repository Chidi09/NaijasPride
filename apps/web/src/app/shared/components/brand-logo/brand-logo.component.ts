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
      [attr.width]="width"
      [attr.height]="height"
    >
  `,
})
export class BrandLogoComponent {
  @Input() variant: 'full' | 'mark' = 'full';
  @Input() alt = 'NaijasPride';
  @Input() className = '';
  @Input() loading: 'eager' | 'lazy' = 'eager';
  @Input() decoding: 'auto' | 'sync' | 'async' = 'async';
  @Input() width = 180;
  @Input() height = 52;

  readonly fullSrc = 'assets/images/logo.svg';
  readonly markSrc = 'assets/icons/android-chrome-192x192.png';
}
