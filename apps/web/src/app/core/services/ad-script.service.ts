import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface EffectiveGateSlotOptions {
  slotId: string;
  key: string;
  format: 'iframe' | 'banner';
  width: number;
  height: number;
  params?: Record<string, string>;
  invokeScriptUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class AdScriptService {
  private platformId = inject(PLATFORM_ID);
  private slotRenderChain: Promise<void> = Promise.resolve();
  private activeEffectiveGateSlot: { container: HTMLElement; slotId: string } | null = null;

  private readonly managedScriptSelector = 'script[data-ad-managed="true"]';
  private readonly adsenseAutoAdsUrl = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2568728658832536';
  private readonly adsenseAutoAdsScriptId = 'adsense-auto-ads-script';
  private readonly effectiveGateSocialBarScriptId = 'effectivegate-socialbar-script';
  private readonly effectiveGateSocialBarUrl = 'https://pl28821993.effectivegatecpm.com/e2/17/7f/e2177fff15ecad68b2c2b7e699359650.js';

  // Pages where AdSense is NOT allowed (Utility/Low Content pages)
  private readonly adBlacklist = [
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/verify-email',
    '/profile',
    '/profile/settings',
    '/payment-callback'
  ];

  ensureAdSenseAutoAdsScript(): void {
    if (!this.canUseDom()) return;

    // Don't load AdSense on blacklisted utility pages
    const currentPath = window.location.pathname;
    if (this.adBlacklist.some(path => currentPath.startsWith(path))) {
      this.unloadAllAdScripts();
      return;
    }

    if (this.hasScriptById(this.adsenseAutoAdsScriptId) || this.hasScriptBySrc(this.adsenseAutoAdsUrl)) return;


    const appendScript = () => {
      if (this.hasScriptById(this.adsenseAutoAdsScriptId) || this.hasScriptBySrc(this.adsenseAutoAdsUrl)) return;

      const script = document.createElement('script');
      script.id = this.adsenseAutoAdsScriptId;
      script.src = this.adsenseAutoAdsUrl;
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    };

    const win = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    if (win.requestIdleCallback) {
      win.requestIdleCallback(appendScript, { timeout: 3000 });
      return;
    }

    setTimeout(appendScript, 1200);
  }

  ensureEffectiveGateSocialBarScript(): void {
    if (!this.canUseDom()) return;
    if (this.hasScriptById(this.effectiveGateSocialBarScriptId) || this.hasScriptBySrc(this.effectiveGateSocialBarUrl)) return;

    const appendScript = () => {
      if (this.hasScriptById(this.effectiveGateSocialBarScriptId) || this.hasScriptBySrc(this.effectiveGateSocialBarUrl)) return;

      const script = document.createElement('script');
      script.id = this.effectiveGateSocialBarScriptId;
      script.src = this.effectiveGateSocialBarUrl;
      script.async = true;
      script.type = 'text/javascript';
      script.dataset['adManaged'] = 'true';
      script.setAttribute('data-cfasync', 'false');
      document.body.appendChild(script);
    };

    const win = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    if (win.requestIdleCallback) {
      win.requestIdleCallback(appendScript, { timeout: 3500 });
      return;
    }

    setTimeout(appendScript, 1500);
  }

  ensureEffectiveGateScript(scriptId: string, scriptUrl: string, attributes: Record<string, string> = {}): void {
    if (!this.canUseDom()) return;
    if (!scriptId || !scriptUrl) return;
    if (this.hasScriptById(scriptId) || this.hasScriptBySrc(scriptUrl)) return;

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = scriptUrl;
    script.async = true;
    script.type = 'text/javascript';
    script.dataset['adManaged'] = 'true';
    for (const [key, value] of Object.entries(attributes)) {
      script.setAttribute(key, value);
    }

    document.body.appendChild(script);
  }

  renderEffectiveGateSlot(container: HTMLElement, options: EffectiveGateSlotOptions): void {
    if (!this.canUseDom()) return;
    if (!container || !options.slotId) return;

    const existingSlot = container.querySelector(`[data-effectivegate-slot-id="${options.slotId}"]`);
    if (existingSlot) return;

    this.slotRenderChain = this.slotRenderChain.then(() => {
      // EffectiveGate relies on a global atOptions object.
      // Keep a single active slot to avoid global config races.
      if (this.activeEffectiveGateSlot && this.activeEffectiveGateSlot.slotId !== options.slotId) {
        this.clearEffectiveGateSlot(
          this.activeEffectiveGateSlot.container,
          this.activeEffectiveGateSlot.slotId,
        );
      }

      // EffectiveGate uses a global atOptions object.
      // Serialize slot initialization to avoid cross-slot race conditions.
      const configScript = document.createElement('script');
      configScript.type = 'text/javascript';
      configScript.dataset['effectivegateSlotId'] = options.slotId;
      configScript.dataset['adManaged'] = 'true';
      configScript.text = this.buildEffectiveGateConfig(options);

      const invokeScript = document.createElement('script');
      invokeScript.type = 'text/javascript';
      invokeScript.async = true;
      invokeScript.src = options.invokeScriptUrl;
      invokeScript.dataset['effectivegateSlotId'] = options.slotId;
      invokeScript.dataset['adManaged'] = 'true';
      invokeScript.setAttribute('data-cfasync', 'false');

      container.appendChild(configScript);
      container.appendChild(invokeScript);
      this.activeEffectiveGateSlot = { container, slotId: options.slotId };
    });
  }

  clearEffectiveGateSlot(container: HTMLElement, slotId: string): void {
    if (!this.canUseDom()) return;
    if (!container || !slotId) return;

    const slotNodes = container.querySelectorAll(`[data-effectivegate-slot-id="${slotId}"]`);
    slotNodes.forEach(node => node.remove());

    if (this.activeEffectiveGateSlot?.slotId === slotId && this.activeEffectiveGateSlot.container === container) {
      this.activeEffectiveGateSlot = null;
    }
  }

  unloadAllAdScripts(): void {
    if (!this.canUseDom()) return;

    const scripts = document.querySelectorAll(this.managedScriptSelector);
    scripts.forEach(script => script.remove());

    // AdSense warns when custom data-* attributes are attached to its script,
    // so it is managed via id/src rather than data-ad-managed.
    const adsenseById = document.getElementById(this.adsenseAutoAdsScriptId);
    if (adsenseById) {
      adsenseById.remove();
      return;
    }

    const adsenseBySrc = document.querySelector(`script[src="${this.adsenseAutoAdsUrl}"]`);
    if (adsenseBySrc) {
      adsenseBySrc.remove();
    }
  }

  private buildEffectiveGateConfig(options: EffectiveGateSlotOptions): string {
    const params = options.params ?? {};
    const config = {
      key: options.key,
      format: options.format,
      height: options.height,
      width: options.width,
      params,
    };

    return `window.atOptions = ${JSON.stringify(config)};`;
  }

  private hasScriptById(scriptId: string): boolean {
    return !!document.getElementById(scriptId);
  }

  private hasScriptBySrc(scriptUrl: string): boolean {
    return !!document.querySelector(`script[src="${scriptUrl}"]`);
  }

  private canUseDom(): boolean {
    return isPlatformBrowser(this.platformId) && typeof document !== 'undefined';
  }
}
