import { Component, OnInit, OnDestroy, ElementRef, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Adsterra 250x250 display banner.
 * Injects the ad script on init and cleans up on destroy so the ad
 * reloads cleanly on every SPA navigation to the watch room.
 *
 * Zone key: de3f243cb85127ed9142c1ba7abf8c27
 * Network: effectivegatecpm.com
 */
@Component({
  selector: 'app-ad-banner',
  standalone: true,
  template: `
    <div class="flex justify-center my-6">
      <div class="relative">
        <span class="absolute -top-4 left-0 text-[10px] text-gray-600 dark:text-gray-500 uppercase tracking-widest select-none">
          Advertisement
        </span>
        <div id="adsterra-banner-wrapper"></div>
      </div>
    </div>
  `,
})
export class AdBannerComponent implements OnInit, OnDestroy {
  private el = inject(ElementRef);
  private platformId = inject(PLATFORM_ID);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.injectAd();
  }

  private injectAd(): void {
    const wrapper = this.el.nativeElement.querySelector('#adsterra-banner-wrapper') as HTMLElement;
    if (!wrapper) return;

    // atOptions config must come before the invoke script
    const configScript = document.createElement('script');
    configScript.type = 'text/javascript';
    configScript.innerHTML = `
      atOptions = {
        'key'    : 'de3f243cb85127ed9142c1ba7abf8c27',
        'format' : 'iframe',
        'height' : 250,
        'width'  : 250,
        'params' : {}
      };
    `;

    const adScript = document.createElement('script');
    adScript.type = 'text/javascript';
    adScript.src = '//www.effectivegatecpm.com/y50ep07z5c/invoke.js';
    adScript.async = true;
    adScript.setAttribute('data-cfasync', 'false');

    wrapper.appendChild(configScript);
    wrapper.appendChild(adScript);
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const wrapper = this.el.nativeElement.querySelector('#adsterra-banner-wrapper') as HTMLElement;
    if (wrapper) wrapper.innerHTML = '';
  }
}
