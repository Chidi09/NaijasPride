import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-symbol-icon',
  standalone: true,
  template: `
    <span
      class="material-symbols-outlined select-none leading-none"
      [class.fill-1]="fill()"
      [style.fontSize.px]="size()"
      [style.fontVariationSettings]="fontVariation()"
      aria-hidden="true"
    >{{ name() }}</span>
  `,
})
export class SymbolIconComponent {
  name = input.required<string>();
  size = input(24);
  fill = input(false);
  weight = input(400);

  fontVariation = computed(() => `'FILL' ${this.fill() ? 1 : 0}, 'wght' ${this.weight()}, 'GRAD' 0, 'opsz' 24`);
}
