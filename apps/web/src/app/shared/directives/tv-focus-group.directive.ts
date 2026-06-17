import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
} from "@angular/core";

type FocusableElement = HTMLElement & { disabled?: boolean };

@Directive({
  selector: "[appTvFocusGroup]",
  standalone: true,
})
export class TvFocusGroupDirective implements AfterViewInit, OnDestroy {
  @Input() tvAutoFocus = false;

  private observer?: MutationObserver;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    if (this.tvAutoFocus) {
      queueMicrotask(() => this.focusFirst());
    }

    this.observer = new MutationObserver(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || !this.host.nativeElement.contains(active)) {
        return;
      }
    });

    this.observer.observe(this.host.nativeElement, {
      childList: true,
      subtree: true,
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  @HostListener("keydown", ["$event"])
  onKeydown(event: KeyboardEvent): void {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;

    const focusables = this.getFocusableElements();
    if (focusables.length === 0) return;

    const current = document.activeElement as FocusableElement | null;
    if (!current || !this.host.nativeElement.contains(current)) {
      focusables[0].focus();
      event.preventDefault();
      return;
    }

    const next = this.findNextFocusable(current, focusables, event.key);
    if (next) {
      next.focus();
      event.preventDefault();
    }
  }

  private focusFirst(): void {
    const first = this.getFocusableElements()[0];
    first?.focus();
  }

  private getFocusableElements(): FocusableElement[] {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    return Array.from(
      this.host.nativeElement.querySelectorAll<FocusableElement>(selector),
    ).filter((element) => {
      const style = window.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.offsetParent !== null
      );
    });
  }

  private findNextFocusable(
    current: FocusableElement,
    all: FocusableElement[],
    key: string,
  ): FocusableElement | null {
    const currentRect = current.getBoundingClientRect();
    const currentCenterX = currentRect.left + currentRect.width / 2;
    const currentCenterY = currentRect.top + currentRect.height / 2;

    let winner: FocusableElement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of all) {
      if (candidate === current) continue;
      const rect = candidate.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = centerX - currentCenterX;
      const deltaY = centerY - currentCenterY;

      if (key === "ArrowRight" && deltaX <= 0) continue;
      if (key === "ArrowLeft" && deltaX >= 0) continue;
      if (key === "ArrowDown" && deltaY <= 0) continue;
      if (key === "ArrowUp" && deltaY >= 0) continue;

      const primary =
        key === "ArrowLeft" || key === "ArrowRight"
          ? Math.abs(deltaX)
          : Math.abs(deltaY);
      const secondary =
        key === "ArrowLeft" || key === "ArrowRight"
          ? Math.abs(deltaY)
          : Math.abs(deltaX);
      const score = primary + secondary * 0.45;

      if (score < bestScore) {
        bestScore = score;
        winner = candidate;
      }
    }

    return winner;
  }
}
