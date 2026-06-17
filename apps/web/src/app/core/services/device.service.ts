import { Injectable } from "@angular/core";
import { detectTvEnvironment } from "../utils/tv-detection";

@Injectable({ providedIn: "root" })
export class DeviceService {
  isTV(): boolean {
    return detectTvEnvironment();
  }

  shouldShowAds(userPlan: { name?: string } | null): boolean {
    // Secret rule: TV is always ad-free (delight factor)
    if (this.isTV()) {
      return false;
    }

    // Family plan is ad-free everywhere
    if (userPlan?.name === "Family") {
      return false;
    }

    // Everyone else sees ads
    return true;
  }
}
