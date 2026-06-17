import { ErrorHandler, Injectable, inject, NgZone } from "@angular/core";
import { ToastService } from "../services/toast.service";

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private toast = inject(ToastService);
  private zone = inject(NgZone);

  handleError(error: any): void {
    console.error("Global Error:", error);
    this.zone.run(() => {
      this.toast.error("An unexpected error occurred");
    });
  }
}
