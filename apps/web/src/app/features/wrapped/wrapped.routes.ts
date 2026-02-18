import { Routes } from '@angular/router';
import { WrappedDetailComponent } from './pages/wrapped-detail/wrapped-detail.component';

// Helper to get current period for redirect
const getCurrentPeriod = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const WRAPPED_ROUTES: Routes = [
  {
    path: ':period',
    component: WrappedDetailComponent,
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: getCurrentPeriod()
  }
];
