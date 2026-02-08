import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './landing.component.html'
})
export class LandingComponent {
  email = signal('');
  private router = inject(Router);

  getStarted() {
    this.router.navigate(['/login'], {
      queryParams: {
        email: this.email() || undefined,
        returnUrl: '/browse',
      },
    });
  }
}
