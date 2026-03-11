import { Injectable, computed, inject } from '@angular/core';
import { AuthStateService } from '../auth/auth-state.service';

@Injectable({
  providedIn: 'root'
})
export class AdPolicyService {
  private authState = inject(AuthStateService);

  readonly isPremium = computed(() => this.authState.isPremium());
  readonly canShowAds = computed(() => !this.isPremium());
}
