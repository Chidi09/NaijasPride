import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { paginationOutcome } from "./anime.routes";

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
