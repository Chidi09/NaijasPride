import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ToastService } from "../../../core/services/toast.service";

@Component({
  selector: "app-toast-container",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="fixed top-24 right-4 z-[100] flex w-[min(92vw,420px)] flex-col gap-2 pointer-events-none"
    >
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="pointer-events-auto rounded-md border-l-4 px-4 py-3 text-sm shadow-lg animate-[toast-in_220ms_ease-out]"
          [class.bg-emerald-950]="toast.type === 'success'"
          [class.border-emerald-400]="toast.type === 'success'"
          [class.text-emerald-100]="toast.type === 'success'"
          [class.bg-red-950]="toast.type === 'error'"
          [class.border-red-400]="toast.type === 'error'"
          [class.text-red-100]="toast.type === 'error'"
          [class.bg-slate-900]="toast.type === 'info'"
          [class.border-slate-300]="toast.type === 'info'"
          [class.text-slate-100]="toast.type === 'info'"
        >
          <div class="flex items-start gap-3">
            <p class="flex-1 leading-5">{{ toast.text }}</p>
            <button
              type="button"
              class="text-xs uppercase tracking-wider opacity-80 hover:opacity-100"
              (click)="toastService.dismiss(toast.id)"
            >
              Close
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
})
export class ToastContainerComponent {
  protected toastService = inject(ToastService);
}
