import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DeviceService {

  isTV(): boolean {
    if (typeof navigator === 'undefined') return false;

    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('smart-tv') ||
           ua.includes('webos') ||
           ua.includes('tizen') ||
           ua.includes('bravia') ||
           ua.includes('android tv');
  }

  shouldShowAds(userPlan: { name?: string } | null): boolean {
    // Secret rule: TV is always ad-free (delight factor)
    if (this.isTV()) {
      return false;
    }

    // Family plan is ad-free everywhere
    if (userPlan?.name === 'Family') {
      return false;
    }

    // Everyone else sees ads
    return true;
  }
}
