import {
  HardwareData,
  measurement,
  PerformanceSpan,
  ResourceSample,
  timestampRange,
} from "./performance";

type StageDocument = {
  stage: string;
  wall_seconds?: unknown;
  started_at?: unknown;
  ended_at?: unknown;
};
export type Interval = { start: number; end: number };
export type TraceOperation = PerformanceSpan & {
  key: string;
  interval: Interval | null;
  composition: Interval | null;
};
export type TraceStage = {
  name: string;
  seconds: number | null;
  cached: boolean;
  interval: Interval | null;
  operations: TraceOperation[];
  compositionSeconds: number;
};
export type Timeline = {
  origin: number | null;
  end: number;
  stages: TraceStage[];
  samples: ResourceSample[];
  alignedResources: boolean;
};

export function buildTimeline(
  documents: StageDocument[],
  hardware: HardwareData,
  cachedStages: string[],
): Timeline {
  const activeSpans = hardware.spans.filter(
    (s) => !cachedStages.includes(s.stage),
  );
  const ranges = documents
    .filter((s) => !cachedStages.includes(s.stage))
    .map((s) => timestampRange(s.started_at, s.ended_at));
  const anchors = hardware.samples.filter((s) => s.timestamp !== undefined);
  // The first timestamped sample anchors the sampling clock; later readings may drift.
  const sampleOrigin = anchors[0]
    ? anchors[0].timestamp! - anchors[0].t * 1000
    : null;
  const starts = [
    ...ranges.flatMap((r) => ("startedAt" in r ? [r.startedAt] : [])),
    ...activeSpans.flatMap((s) =>
      s.startedAt !== undefined ? [s.startedAt] : [],
    ),
  ];
  const origin =
    sampleOrigin === null
      ? starts.length
        ? Math.min(...starts)
        : null
      : Math.min(sampleOrigin, ...starts);
  const relative = (
    a: number | undefined,
    b: number | undefined,
  ): Interval | null =>
    origin !== null && a !== undefined && b !== undefined && b >= a
      ? { start: (a - origin) / 1000, end: (b - origin) / 1000 }
      : null;
  const names = [
    ...new Set([
      ...documents.map((s) => s.stage),
      ...hardware.spans.map((s) => s.stage),
    ]),
  ];
  const stages = names.map((name) => {
    const cached = cachedStages.includes(name);
    const document = documents.find((s) => s.stage === name);
    const range = timestampRange(document?.started_at, document?.ended_at);
    const counts = new Map<string, number>();
    let elapsed = 0;
    const operations = hardware.spans
      .filter((s) => s.stage === name)
      .map((s) => {
        const id = `${s.name}:${s.window ?? ""}`;
        const ordinal = counts.get(id) ?? 0;
        counts.set(id, ordinal + 1);
        const composition =
          s.seconds === null
            ? null
            : { start: elapsed, end: elapsed + s.seconds };
        if (s.seconds !== null) elapsed += s.seconds;
        return {
          ...s,
          key: `${id}:${ordinal}`,
          interval: cached ? null : relative(s.startedAt, s.endedAt),
          composition,
        };
      });
    const recorded = operations.flatMap((s) =>
      s.interval ? [s.interval] : [],
    );
    const interval = cached
      ? null
      : "startedAt" in range
        ? relative(range.startedAt, range.endedAt)
        : recorded.length
          ? {
              start: Math.min(...recorded.map((s) => s.start)),
              end: Math.max(...recorded.map((s) => s.end)),
            }
          : null;
    return {
      name,
      cached,
      interval,
      seconds: measurement(document?.wall_seconds),
      operations,
      compositionSeconds: elapsed,
    };
  });
  const samples = hardware.samples
    .map((s) => ({
      ...s,
      t:
        origin !== null && s.timestamp !== undefined
          ? (s.timestamp - origin) / 1000
          : origin !== null && sampleOrigin !== null
            ? s.t + (sampleOrigin - origin) / 1000
            : s.t,
    }))
    .sort((a, b) => a.t - b.t);
  const end = Math.max(
    1,
    ...stages.flatMap((s) => (s.interval ? [s.interval.end] : [])),
    ...stages.flatMap((s) =>
      s.operations.flatMap((op) => (op.interval ? [op.interval.end] : [])),
    ),
    ...samples.map((s) => s.t),
  );
  const order = ["audio", "dialogue", "color", "vlm", "llm"];
  stages.sort((a, b) =>
    a.interval && b.interval
      ? a.interval.start - b.interval.start
      : (order.includes(a.name) ? order.indexOf(a.name) : order.length) -
        (order.includes(b.name) ? order.indexOf(b.name) : order.length),
  );
  return { origin, end, stages, samples, alignedResources: anchors.length > 0 };
}

export function phaseRows(
  stages: (TraceStage | undefined)[],
): { key: string; name: string; window: number | null; attempt?: number }[] {
  const rows = new Map<
    string,
    { key: string; name: string; window: number | null; attempt?: number }
  >();
  for (const stage of stages)
    for (const op of stage?.operations || [])
      if (!rows.has(op.key))
        rows.set(op.key, {
          key: op.key,
          name: op.name,
          window: op.window,
          ...(op.attempt ? { attempt: op.attempt } : {}),
        });
  return [...rows.values()];
}
