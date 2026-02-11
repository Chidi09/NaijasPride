import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './core/components/navbar/navbar.component';
import { DeviceService } from './core/services/device.service';
import { ReaderStateService } from './core/services/reader-state.service';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, ToastContainerComponent],
  template: `
    <div class="min-h-screen flex flex-col bg-cinema-900 text-cinema-50">
      @if (!readerState.navbarHidden()) {
        <app-navbar />
      }

      <main [class.pt-20]="!readerState.navbarHidden()">
        <router-outlet />
      </main>

      <app-toast-container />
    </div>
  `
})
export class AppComponent implements OnInit {
  private deviceService = inject(DeviceService);
  protected readerState = inject(ReaderStateService);

  ngOnInit() {
    if (this.deviceService.isTV()) {
      document.body.classList.add('tv-mode');
    }
  }
}
