export type ResolutionTraceEvent = {
  at: number;
  stage: string;
  provider: string;
  outcome: "success" | "miss" | "error";
  detail?: string;
};

export const createResolutionTrace = (): ResolutionTraceEvent[] => [];

export const pushResolutionEvent = (
  trace: ResolutionTraceEvent[],
  event: Omit<ResolutionTraceEvent, "at">,
): void => {
  trace.push({ at: Date.now(), ...event });
};

export const summarizeResolutionTrace = (trace: ResolutionTraceEvent[]) => {
  const successes = trace.filter((entry) => entry.outcome === "success").length;
  const misses = trace.filter((entry) => entry.outcome === "miss").length;
  const errors = trace.filter((entry) => entry.outcome === "error").length;
  return {
    totalEvents: trace.length,
    successes,
    misses,
    errors,
  };
};
