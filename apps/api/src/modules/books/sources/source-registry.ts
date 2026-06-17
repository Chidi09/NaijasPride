import { MangaSource } from "./types";

export class MangaSourceRegistry {
  private readonly sources = new Map<string, MangaSource>();

  register(source: MangaSource): void {
    this.sources.set(source.id, source);
  }

  get(sourceId: string): MangaSource | null {
    return this.sources.get(sourceId) || null;
  }

  list(): MangaSource[] {
    return Array.from(this.sources.values());
  }

  has(sourceId: string): boolean {
    return this.sources.has(sourceId);
  }
}
