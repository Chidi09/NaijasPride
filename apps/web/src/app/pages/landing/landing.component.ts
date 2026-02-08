import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

type AnimPhase = 'glitch' | 'dissolve' | 'hero';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent implements OnInit, OnDestroy {
  email = signal('');
  phase = signal<AnimPhase>('glitch');

  /** Characters of "NAIJAsPRIDE" revealed one-by-one */
  readonly brandName = 'NAIJAsPRIDE';
  /** First 5 characters ("NAIJA") are burgundy, rest ("sPRIDE") are white */
  readonly burgundyCount = 5;
  revealedChars = signal(0);
  private timers: ReturnType<typeof setTimeout>[] = [];

  private router = inject(Router);

  ngOnInit() {
    // Check if user prefers reduced motion
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      this.revealedChars.set(this.brandName.length);
      this.phase.set('hero');
      return;
    }

    this.startSequence();
  }

  ngOnDestroy() {
    this.timers.forEach(clearTimeout);
  }

  getStarted() {
    this.router.navigate(['/login'], {
      queryParams: {
        email: this.email() || undefined,
        returnUrl: '/browse',
      },
    });
  }

  skipAnimation() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.revealedChars.set(this.brandName.length);
    this.phase.set('hero');
  }

  private startSequence() {
    const charDelay = 180;   // ms between each character
    const holdTime = 600;    // ms to hold completed name
    const dissolveTime = 700; // ms for dissolve animation

    // Phase 1: Reveal characters one-by-one with glitch
    for (let i = 0; i < this.brandName.length; i++) {
      const t = setTimeout(() => {
        this.revealedChars.set(i + 1);
      }, i * charDelay);
      this.timers.push(t);
    }

    // Phase 2: Hold the full name, then dissolve
    const dissolveStart = this.brandName.length * charDelay + holdTime;
    const t2 = setTimeout(() => {
      this.phase.set('dissolve');
    }, dissolveStart);
    this.timers.push(t2);

    // Phase 3: Transition to hero content
    const heroStart = dissolveStart + dissolveTime;
    const t3 = setTimeout(() => {
      this.phase.set('hero');
    }, heroStart);
    this.timers.push(t3);
  }
}
