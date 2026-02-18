import { Injectable, signal } from '@angular/core';

export type TtsVoice = {
  uri: string;
  name: string;
  lang: string;
  isDefault: boolean;
};

type TtsState = {
  speaking: boolean;
  paused: boolean;
  rate: number;
  voiceUri: string | null;
  lastError: string | null;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

@Injectable({
  providedIn: 'root',
})
export class ReaderTtsService {
  readonly available = signal<boolean>(typeof window !== 'undefined' && 'speechSynthesis' in window);

  readonly voices = signal<TtsVoice[]>([]);

  readonly state = signal<TtsState>({
    speaking: false,
    paused: false,
    rate: 1.0,
    voiceUri: null,
    lastError: null,
  });

  private utterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    if (!this.available()) return;
    this.refreshVoices();
    try {
      window.speechSynthesis.onvoiceschanged = () => this.refreshVoices();
    } catch {
      // ignore
    }
  }

  setRate(rate: number): void {
    const next = clamp(Math.round(rate * 10) / 10, 0.6, 1.6);
    this.state.update((s) => ({ ...s, rate: next }));
  }

  setVoiceUri(uri: string | null): void {
    const next = typeof uri === 'string' ? uri : null;
    this.state.update((s) => ({ ...s, voiceUri: next }));
  }

  speak(text: string): boolean {
    if (!this.available()) {
      this.state.update((s) => ({ ...s, lastError: 'Text-to-speech is not available in this browser.' }));
      return false;
    }

    const trimmed = (text || '').replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      this.state.update((s) => ({ ...s, lastError: 'Nothing to read.' }));
      return false;
    }

    this.stop();
    this.state.update((s) => ({ ...s, lastError: null }));

    const u = new SpeechSynthesisUtterance(trimmed);
    u.rate = clamp(this.state().rate, 0.6, 1.6);

    const voice = this.resolveVoice(this.state().voiceUri);
    if (voice) {
      try {
        u.voice = voice as any;
      } catch {
        // ignore
      }
    }

    u.onstart = () => {
      this.state.update((s) => ({ ...s, speaking: true, paused: false }));
    };
    u.onend = () => {
      this.state.update((s) => ({ ...s, speaking: false, paused: false }));
    };
    u.onerror = (event: any) => {
      const message = typeof event?.error === 'string' ? event.error : 'TTS error';
      this.state.update((s) => ({ ...s, speaking: false, paused: false, lastError: message }));
    };

    this.utterance = u;
    try {
      window.speechSynthesis.speak(u);
      return true;
    } catch {
      this.state.update((s) => ({ ...s, speaking: false, paused: false, lastError: 'Failed to start TTS.' }));
      return false;
    }
  }

  pause(): void {
    if (!this.available()) return;
    try {
      window.speechSynthesis.pause();
      this.state.update((s) => ({ ...s, paused: true }));
    } catch {
      // ignore
    }
  }

  resume(): void {
    if (!this.available()) return;
    try {
      window.speechSynthesis.resume();
      this.state.update((s) => ({ ...s, paused: false }));
    } catch {
      // ignore
    }
  }

  togglePause(): void {
    const s = this.state();
    if (!s.speaking) return;
    s.paused ? this.resume() : this.pause();
  }

  stop(): void {
    if (!this.available()) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    this.utterance = null;
    this.state.update((s) => ({ ...s, speaking: false, paused: false }));
  }

  private refreshVoices(): void {
    if (!this.available()) return;
    try {
      const list = window.speechSynthesis.getVoices() || [];
      const normalized: TtsVoice[] = list
        .map((v) => ({
          uri: String((v as any).voiceURI || ''),
          name: String((v as any).name || ''),
          lang: String((v as any).lang || ''),
          isDefault: !!(v as any).default,
        }))
        .filter((v) => !!v.uri && !!v.name);

      this.voices.set(normalized);
    } catch {
      this.voices.set([]);
    }
  }

  private resolveVoice(uri: string | null): SpeechSynthesisVoice | null {
    if (!this.available()) return null;
    try {
      const list = window.speechSynthesis.getVoices() || [];
      if (!uri) {
        const def = list.find((v: any) => !!v?.default);
        return def || null;
      }
      const match = list.find((v: any) => String(v?.voiceURI || '') === uri);
      return match || null;
    } catch {
      return null;
    }
  }
}
