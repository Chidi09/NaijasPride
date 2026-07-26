import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveSubtitles,
  type SubtitleProvider,
  type SubtitleQuery,
  type SubtitleTrack,
} from "./subtitle-provider";

function track(overrides: Partial<SubtitleTrack> = {}): SubtitleTrack {
  return {
    id: "1",
    provider: "test",
    language: "en",
    label: "English",
    url: "https://example.test/a.srt",
    format: "srt",
    hearingImpaired: false,
    rank: 0,
    ...overrides,
  };
}

function stub(
  name: string,
  tracks: SubtitleTrack[],
  options: {
    configured?: boolean;
    supports?: boolean;
    delayMs?: number;
    throws?: boolean;
  } = {},
): SubtitleProvider & { called: () => boolean } {
  let called = false;
  return {
    name,
    called: () => called,
    isConfigured: () => options.configured !== false,
    supports: () => options.supports !== false,
    async search() {
      called = true;
      if (options.throws) throw new Error("provider exploded");
      if (options.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      return tracks;
    },
  };
}

const query: SubtitleQuery = {
  tmdbId: 550,
  anilistId: 269,
  languages: ["en"],
};

describe("resolveSubtitles", () => {
  it("merges tracks from every provider that can answer", async () => {
    const a = stub("a", [track({ id: "a1", provider: "a" })]);
    const b = stub("b", [track({ id: "b1", provider: "b" })]);

    const result = await resolveSubtitles([a, b], query);

    assert.equal(result.tracks.length, 2);
    assert.deepEqual(result.providersQueried.sort(), ["a", "b"]);
  });

  it("skips a provider with no API key without calling it", async () => {
    // The whole point of the provider split: a deployment that has only one
    // key must still get results from that one rather than failing.
    const configured = stub("configured", [track({ provider: "configured" })]);
    const unconfigured = stub("unconfigured", [track()], {
      configured: false,
    });

    const result = await resolveSubtitles([configured, unconfigured], query);

    assert.equal(unconfigured.called(), false);
    assert.deepEqual(result.providersQueried, ["configured"]);
    assert.deepEqual(result.providersSkipped, ["unconfigured"]);
    assert.equal(result.tracks.length, 1);
  });

  it("skips a provider the query has no identifiers for", async () => {
    const anilistOnly = stub("anilist-only", [track()], { supports: false });
    const result = await resolveSubtitles([anilistOnly], query);

    assert.equal(anilistOnly.called(), false);
    assert.deepEqual(result.providersSkipped, ["anilist-only"]);
  });

  it("does not let one failing provider lose another's results", async () => {
    const broken = stub("broken", [], { throws: true });
    const working = stub("working", [track({ provider: "working" })]);

    const result = await resolveSubtitles([broken, working], query);

    assert.equal(result.tracks.length, 1);
    assert.equal(result.tracks[0].provider, "working");
  });

  it("orders requested languages ahead of everything else", async () => {
    // Jimaku returns Japanese tracks, and an English request must not have
    // them pushed to the top just because that provider answered first.
    const japanese = stub("jimaku", [
      track({ id: "ja1", provider: "jimaku", language: "ja", rank: 999 }),
    ]);
    const english = stub("wyzie", [
      track({ id: "en1", provider: "wyzie", language: "en", rank: 1 }),
    ]);

    const result = await resolveSubtitles([japanese, english], {
      ...query,
      languages: ["en"],
    });

    assert.equal(result.tracks[0].language, "en");
    // Still offered, rather than dropped — it may be all that exists.
    assert.equal(result.tracks[1].language, "ja");
  });

  it("orders by rank within a language", async () => {
    const provider = stub("p", [
      track({ id: "low", rank: 5 }),
      track({ id: "high", rank: 5000 }),
    ]);

    const result = await resolveSubtitles([provider], query);

    assert.deepEqual(
      result.tracks.map((t) => t.id),
      ["high", "low"],
    );
  });

  it("deduplicates by provider and id", async () => {
    const a = stub("a", [
      track({ id: "same", provider: "a" }),
      track({ id: "same", provider: "a" }),
    ]);

    const result = await resolveSubtitles([a], query);

    assert.equal(result.tracks.length, 1);
  });

  it("keeps distinct ids from different providers", async () => {
    const a = stub("a", [track({ id: "same", provider: "a" })]);
    const b = stub("b", [track({ id: "same", provider: "b" })]);

    const result = await resolveSubtitles([a, b], query);

    assert.equal(result.tracks.length, 2);
  });

  it("falls back to English when the caller names no language", async () => {
    const provider = stub("p", [track({ language: "en" })]);
    const result = await resolveSubtitles([provider], {
      ...query,
      languages: [],
    });
    assert.equal(result.tracks.length, 1);
  });
});
