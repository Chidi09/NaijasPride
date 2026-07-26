import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyJikanPage, paginationOutcome } from "./anime.routes";

describe("paginationOutcome", () => {
  it("treats a walk that stopped early as partial, not success", () => {
    // The bug this pins down: Jikan's episode list for Bleach is four pages,
    // and a walk that read page one and then hit a rate limit returned a
    // well-formed set of 39 filler episodes out of far more. Reported as
    // success, that read as "this series has almost no filler" and was cached
    // as such for a day.
    assert.equal(paginationOutcome(1, 4), "partial");
  });

  it("recognises a walk that read every page", () => {
    assert.equal(paginationOutcome(4, 4), "complete");
  });

  it("does not confuse reading nothing with reading part of it", () => {
    // Different failures: one means the source never answered, the other that
    // it answered and then stopped. Only the second has usable data.
    assert.equal(paginationOutcome(0, 4), "none");
  });

  it("accepts a walk whose length was never announced", () => {
    // Some responses carry no page count. Having read at least one page and
    // been told there is no next one is as complete as it gets.
    assert.equal(paginationOutcome(1, null), "complete");
  });

  it("does not report partial when more pages were read than announced", () => {
    assert.equal(paginationOutcome(5, 4), "complete");
  });
});

describe("classifyJikanPage", () => {
  it("recognises Jikan's HTTP 200 upstream error as a failure", () => {
    // The real body that caused this: MyAnimeList timed out, Jikan wrapped it
    // in a 200 with the true status in the payload. response.ok was true and
    // JSON.parse succeeded, so it was read as data — an episode list with no
    // episodes and no pagination, indistinguishable from a one-page series
    // with no filler, and cached as that for 24 hours.
    assert.equal(
      classifyJikanPage({
        status: 500,
        type: "UpstreamException",
        message: "Request to MyAnimeList.net timed out (10 seconds).",
      }),
      "upstream-error",
    );
  });

  it("treats a page with no episodes as empty rather than as data", () => {
    assert.equal(classifyJikanPage({ pagination: {} }), "empty");
  });

  it("accepts a page that actually carries episodes", () => {
    assert.equal(
      classifyJikanPage({
        data: [{ mal_id: 97, filler: true }],
        pagination: { has_next_page: true, last_visible_page: 4 },
      }),
      "episodes",
    );
  });

  it("does not mistake a rate-limit status for episode data", () => {
    assert.equal(
      classifyJikanPage({ status: 429, type: "RateLimit" }),
      "upstream-error",
    );
  });
});
