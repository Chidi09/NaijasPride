import { bootstrapApplication } from '@angular/platform-browser';
import { register } from 'swiper/element/bundle';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import {
  captureSentryWebException,
  initSentryWebHandlers,
  isSentryWebEnabled,
} from './app/core/services/sentry-web.service';

initSentryWebHandlers();
register();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => {
    captureSentryWebException(err, { phase: 'bootstrap' });
    console.error(err);
  });

if (isSentryWebEnabled()) {
  console.info('Sentry web error tracking enabled');
}

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((err) => {
        captureSentryWebException(err, { phase: 'service-worker-register' });
        console.error('Service worker registration failed', err);
      });
  });
}
