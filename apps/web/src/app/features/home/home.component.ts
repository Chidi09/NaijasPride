import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="py-10 text-center">
      <h2 class="text-4xl font-bold text-gray-900 mb-4">Welcome Home</h2>
      <p class="text-gray-600">The platform is successfully initialized.</p>
    </div>
  `
})
export class HomeComponent {}
