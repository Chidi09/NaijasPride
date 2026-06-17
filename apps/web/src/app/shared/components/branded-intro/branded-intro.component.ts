import { Component, EventEmitter, Output, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { BrandLogoComponent } from "../brand-logo/brand-logo.component";

@Component({
  selector: "app-branded-intro",
  standalone: true,
  imports: [CommonModule, BrandLogoComponent],
  template: `
    <div class="intro-container">
      <div class="brand-wrap">
        <app-brand-logo
          variant="full"
          alt="NaijasPride"
          className="brand-logo"
        />
      </div>
    </div>
  `,
  styles: [
    `
      .intro-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: #000;
        z-index: 9999;
        display: flex;
        justify-content: center;
        align-items: center;
        animation: fadeOut 0.5s ease-out 3.5s forwards;
      }

      .brand-wrap {
        opacity: 0;
        transform: scale(0.7);
        filter: blur(10px);
        animation:
          popIn 0.8s ease-out 0.15s forwards,
          zoomIn 2.8s ease-out 1s forwards;
      }

      :host ::ng-deep .brand-logo {
        width: min(72vw, 560px);
        height: auto;
        display: block;
      }

      @keyframes popIn {
        from {
          opacity: 0;
          transform: scale(1.08);
          filter: blur(10px);
        }
        to {
          opacity: 1;
          transform: scale(1);
          filter: blur(0);
        }
      }

      @keyframes zoomIn {
        0% {
          transform: scale(1);
        }
        100% {
          transform: scale(1.5);
        }
      }

      @keyframes fadeOut {
        to {
          opacity: 0;
          visibility: hidden;
        }
      }
    `,
  ],
})
export class BrandedIntroComponent implements OnInit {
  @Output() introFinished = new EventEmitter<void>();

  ngOnInit() {
    setTimeout(() => {
      this.introFinished.emit();
    }, 4000);
  }
}
