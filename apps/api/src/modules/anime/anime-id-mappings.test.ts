import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseAniZipMappings,
  subtitleEpisodeNumbering,
  type AnimeMappingResult,
} from "./anime-id-mappings";

describe("parseAniZipMappings", () => {
  it("reads the ids the general subtitle providers need", () => {
    const result = parseAniZipMappings({
      mappings: {
        mal_id: 269,
        kitsu_id: 244,
        // ani.zip sends this one as a string, unlike the rest.
        themoviedb_id: "30984",
        imdb_id: "tt0434665",
        thetvdb_id: 74796,
        type: "TV",
      },
    });

    assert.deepEqual(result.ids, {
      malId: 269,
      kitsuId: 244,
      tmdbId: 30984,
      imdbId: "tt0434665",
      tvdbId: 74796,
      type: "TV",
    });
    assert.equal(result.outcome, "success");
  });

  it("reports a miss when the entry maps to nothing", () => {
    const result = parseAniZipMappings({ mappings: {}, episodes: {} });
    assert.equal(result.outcome, "miss");
    assert.equal(result.ids.tmdbId, null);
  });

  it("prefers the English episode title", () => {
    const result = parseAniZipMappings({
      episodes: {
        "1": {
          title: {
            ja: "死神になっちゃった日",
            en: "A Shinigami is Born!",
            "x-jat": "Shinigami ni Nacchatta Hi",
          },
        },
      },
    });

    assert.equal(result.episodes.get(1)?.title, "A Shinigami is Born!");
  });

  it("falls back to romaji rather than Japanese script", () => {
    // An episode row labelled in a script the viewer cannot read is worse
    // than one left untitled, so the romanised form comes first.
    const result = parseAniZipMappings({
      episodes: {
        "1": {
          title: { ja: "巨大砲弾で中央突破?", "x-jat": "Kyodai Houdan" },
        },
      },
    });

    assert.equal(result.episodes.get(1)?.title, "Kyodai Houdan");
  });

  it("drops specials, which have no place in absolute numbering", () => {
    const result = parseAniZipMappings({
      episodes: {
        "1": { title: { en: "Episode 1" } },
        S1: { title: { en: "A special" } },
      },
    });

    assert.deepEqual([...result.episodes.keys()], [1]);
  });

  it("ignores an episode carrying neither a title nor an image", () => {
    const result = parseAniZipMappings({
      episodes: { "1": { title: null, image: null } },
    });

    assert.equal(result.episodes.size, 0);
  });
});

function mapping(
  overrides: Partial<AnimeMappingResult> = {},
): AnimeMappingResult {
  return {
    ids: {
      malId: null,
      kitsuId: null,
      tmdbId: 1,
      imdbId: null,
      tvdbId: null,
      type: "TV",
    },
    episodes: new Map(),
    outcome: "success",
    ...overrides,
  };
}

describe("subtitleEpisodeNumbering", () => {
  it("uses the matched TVDB numbering when there is one", () => {
    const result = subtitleEpisodeNumbering(
      mapping({
        episodes: new Map([
          [27, { title: null, image: null, seasonNumber: 2, episodeNumber: 7 }],
        ]),
      }),
      27,
    );

    assert.deepEqual(result, { season: 2, episode: 7 });
  });

  it("falls back to season 1 and the absolute number", () => {
    // Right for the single-season runs that make up most of the catalogue,
    // and a miss rather than a mismatch where it is wrong: the providers
    // match on the numbers given, so a wrong season finds nothing rather
    // than the wrong episode's file.
    assert.deepEqual(subtitleEpisodeNumbering(mapping(), 25), {
      season: 1,
      episode: 25,
    });
  });

  it("sends no episode for a film", () => {
    const film = mapping();
    film.ids.type = "MOVIE";
    assert.deepEqual(subtitleEpisodeNumbering(film, 1), {
      season: null,
      episode: null,
    });
  });

  it("sends no episode when the caller has none", () => {
    assert.deepEqual(subtitleEpisodeNumbering(mapping(), null), {
      season: null,
      episode: null,
    });
  });
});
