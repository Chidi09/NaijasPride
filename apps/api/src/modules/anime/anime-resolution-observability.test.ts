import test from "node:test";
import assert from "node:assert/strict";
import {
  createResolutionTrace,
  pushResolutionEvent,
  summarizeResolutionTrace,
} from "./anime-resolution-observability";

test("summarizeResolutionTrace counts outcomes and events", () => {
  const trace = createResolutionTrace();
  pushResolutionEvent(trace, {
    stage: "animepahe-watch",
    provider: "animepahe",
    outcome: "error",
    detail: "challenge",
  });
  pushResolutionEvent(trace, {
    stage: "bridge-watch",
    provider: "zoro",
    outcome: "miss",
  });
  pushResolutionEvent(trace, {
    stage: "hianime-fallback",
    provider: "hianime",
    outcome: "success",
  });

  const summary = summarizeResolutionTrace(trace);
  assert.equal(summary.totalEvents, 3);
  assert.equal(summary.successes, 1);
  assert.equal(summary.misses, 1);
  assert.equal(summary.errors, 1);
});

test("pushResolutionEvent stores timestamped event", () => {
  const trace = createResolutionTrace();
  pushResolutionEvent(trace, {
    stage: "animepahe-episodes",
    provider: "animepahe",
    outcome: "success",
  });

  assert.equal(trace.length, 1);
  assert.equal(trace[0]?.stage, "animepahe-episodes");
  assert.equal(trace[0]?.provider, "animepahe");
  assert.equal(trace[0]?.outcome, "success");
  assert.equal(typeof trace[0]?.at, "number");
});
