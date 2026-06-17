import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  inject,
  PLATFORM_ID,
  computed,
  effect,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { AdPolicyService } from "../../../core/services/ad-policy.service";
import { AdScriptService } from "../../../core/services/ad-script.service";

/**
 * Adsterra 250x250 display banner.
 * Injects the ad script on init and cleans up on destroy so the ad
 * reloads cleanly on every SPA navigation to the watch room.
 * Premium users do not see ads.
 *
 * Zone key: de3f243cb85127ed9142c1ba7abf8c27
 * Network: effectivegatecpm.com
 */
@Component({
  selector: "app-ad-banner",
  standalone: true,
  template: `
    @if (shouldShowAd()) {
      <div class="flex justify-center my-6">
        <div class="relative">
          <span
            class="absolute -top-4 left-0 text-[10px] text-gray-600 dark:text-gray-500 uppercase tracking-widest select-none"
          >
            Advertisement
          </span>
          <div id="adsterra-banner-wrapper"></div>
        </div>
      </div>
    }
  `,
})
export class AdBannerComponent implements OnInit, OnDestroy {
  private readonly slotId = "watch-room-250x250";
  private rendered = false;
  private el = inject(ElementRef);
  private platformId = inject(PLATFORM_ID);
  private adPolicy = inject(AdPolicyService);
  private adScriptService = inject(AdScriptService);

  shouldShowAd = computed(() => this.adPolicy.canShowAds());

  constructor() {
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      const visible = this.shouldShowAd();
      if (visible) {
        queueMicrotask(() => this.injectAd());
        return;
      }

      this.clearAd();
    });
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.shouldShowAd()) {
      this.injectAd();
    }
  }

  private injectAd(): void {
    if (this.rendered) return;
    const wrapper = this.el.nativeElement.querySelector(
      "#adsterra-banner-wrapper",
    ) as HTMLElement;
    if (!wrapper) return;

    this.adScriptService.renderEffectiveGateSlot(wrapper, {
      slotId: this.slotId,
      key: "de3f243cb85127ed9142c1ba7abf8c27",
      format: "iframe",
      height: 250,
      width: 250,
      params: {},
      invokeScriptUrl: "//www.effectivegatecpm.com/y50ep07z5c/invoke.js",
    });
    this.rendered = true;
  }

  private clearAd(): void {
    const wrapper = this.el.nativeElement.querySelector(
      "#adsterra-banner-wrapper",
    ) as HTMLElement;
    if (!wrapper) return;
    this.adScriptService.clearEffectiveGateSlot(wrapper, this.slotId);
    wrapper.innerHTML = "";
    this.rendered = false;
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.clearAd();
  }
}
