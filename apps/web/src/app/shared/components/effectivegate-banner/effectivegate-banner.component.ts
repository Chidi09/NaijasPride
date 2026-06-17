import {
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { AdPolicyService } from "../../../core/services/ad-policy.service";
import { AdScriptService } from "../../../core/services/ad-script.service";

@Component({
  selector: "app-effectivegate-banner",
  standalone: true,
  template: `
    @if (shouldShowBanner()) {
      <div class="my-4 flex justify-center">
        <div class="relative">
          <span
            class="pointer-events-none absolute -top-4 left-0 text-[10px] uppercase tracking-widest text-gray-600 dark:text-gray-500"
          >
            Advertisement
          </span>
          <div
            id="effectivegate-banner-wrapper"
            class="min-h-[50px] min-w-[320px]"
          ></div>
        </div>
      </div>
    }
  `,
})
export class EffectivegateBannerComponent implements OnDestroy {
  private readonly slotId = "effectivegate-320x50";
  private readonly el = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly adPolicy = inject(AdPolicyService);
  private readonly adScriptService = inject(AdScriptService);

  private rendered = false;

  readonly shouldShowBanner = computed(() => this.adPolicy.canShowAds());

  constructor() {
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;

      if (this.shouldShowBanner()) {
        queueMicrotask(() => this.injectBanner());
      } else {
        this.clearBanner();
      }
    });
  }

  private injectBanner(): void {
    if (this.rendered) return;

    const wrapper = this.el.nativeElement.querySelector(
      "#effectivegate-banner-wrapper",
    ) as HTMLElement | null;
    if (!wrapper) return;

    this.adScriptService.renderEffectiveGateSlot(wrapper, {
      slotId: this.slotId,
      key: "efea465d4fdc9eabe553fbaecd0c4948",
      format: "iframe",
      width: 320,
      height: 50,
      params: {},
      invokeScriptUrl:
        "//www.effectivegatecpm.com/efea465d4fdc9eabe553fbaecd0c4948/invoke.js",
    });

    this.rendered = true;
  }

  private clearBanner(): void {
    const wrapper = this.el.nativeElement.querySelector(
      "#effectivegate-banner-wrapper",
    ) as HTMLElement | null;
    if (!wrapper) return;

    this.adScriptService.clearEffectiveGateSlot(wrapper, this.slotId);
    wrapper.innerHTML = "";
    this.rendered = false;
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.clearBanner();
  }
}
