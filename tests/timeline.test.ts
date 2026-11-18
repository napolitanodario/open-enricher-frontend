import { test } from "node:test";
import assert from "node:assert/strict";
import { importFiles, loadDetails } from "../lib/data";
import {
  HardwareData,
  parsePerformanceCsv,
  parseResourceCsv,
  timestamp,
  timestampRange,
} from "../lib/performance";
import { buildTimeline, phaseRows } from "../lib/timeline";
const base = Date.parse("2026-11-02T17:00:00Z");
const iso = (seconds: number) => new Date(base + seconds * 1000).toISOString();
function span(
  stage: string,
  name: string,
  start: number,
  end: number,
  window: number | null = null,
) {
  return {
    stage,
    name,
    startedAt: base + start * 1000,
    endedAt: base + end * 1000,
    seconds: end - start,
    window,
    reserved: 2048,
    allocated: 1024,
  };
}
function source(path: string, value: unknown) {
  const f = new File(
    [typeof value === "string" ? value : JSON.stringify(value)],
    path.split("/").pop()!,
  );
  Object.defineProperty(f, "webkitRelativePath", { value: path });
  return f;
}

test("ISO UTC timestamps preserve fractions and timezone offsets and reject local clock strings", () => {
  assert.equal(timestamp("2026-11-02T17:00:00.123456+00:00"), base + 123);
  assert.equal(timestamp("2026-11-02T18:00:00+01:00"), base);
  assert.equal(timestamp("2026-11-02T17:00:00"), null);
  assert.equal(timestamp("not a date"), null);
  assert.deepEqual(timestampRange(iso(5), iso(4)), {});
});

test("timestamped resource samples and operation CSVs join on one clock with real gaps and overlaps", () => {
  const warnings: string[] = [];
  const spans = parsePerformanceCsv(
    `experiment,video,stage,span,window,started_at,ended_at,seconds,vram_reserved_mib,vram_allocated_mib\nx,v,vlm,load,,${iso(2)},${iso(7)},5,2048,1024\nx,v,vlm,generate,1,${iso(10)},${iso(16)},6,2048,1024\nx,v,vlm,generate,2,${iso(14)},${iso(22)},8,2048,1024\n`,
    { experiment: "x", video: "v" },
    warnings,
  );
  const samples = parseResourceCsv(
    `timestamp,t_seconds,vram_device_mib,ram_mib,cpu_cores\n${iso(0)},0,100,200,\n${iso(5.1)},5,200,300,1\n${iso(10.3)},10,400,500,2\n`,
    warnings,
  );
  const t = buildTimeline(
    [{ stage: "vlm", started_at: iso(1), ended_at: iso(23), wall_seconds: 22 }],
    { spans, samples },
    [],
  );
  assert.equal(t.origin, base);
  assert.deepEqual(t.stages[0].interval, { start: 1, end: 23 });
  assert.deepEqual(
    t.stages[0].operations.map((s) => s.interval),
    [
      { start: 2, end: 7 },
      { start: 10, end: 16 },
      { start: 14, end: 22 },
    ],
  );
  assert.equal(t.samples[1].t, 5.1);
  assert.equal(t.samples[2].t, 10.3);
  assert.equal(t.alignedResources, true);
  assert.deepEqual(warnings, []);
});

test("cached timestamps never change this execution's origin or extend its trace", () => {
  const hardware: HardwareData = {
    spans: [
      span("audio", "load", -86400, -86390),
      span("vlm", "generate", 5, 15),
    ],
    samples: [{ t: 0, timestamp: base, vram: 100, ram: 200, cpu: null }],
  };
  const t = buildTimeline(
    [
      {
        stage: "audio",
        started_at: iso(-86400),
        ended_at: iso(-86390),
        wall_seconds: 10,
      },
      { stage: "vlm", started_at: iso(4), ended_at: iso(16), wall_seconds: 12 },
    ],
    hardware,
    ["audio"],
  );
  assert.equal(t.origin, base);
  assert.equal(t.end, 16);
  assert.equal(t.stages.find((s) => s.name === "audio")!.interval, null);
  assert.equal(
    t.stages.find((s) => s.name === "audio")!.operations[0].interval,
    null,
  );
  assert.equal(t.stages.find((s) => s.name === "audio")!.seconds, 10);
});

test("legacy duration composition retains unavailable values without inventing execution offsets", () => {
  const spans = [
    span("vlm", "generate", 0, 3, 1),
    span("vlm", "generate", 3, 7, 2),
  ].map(({ startedAt, endedAt, ...s }) => s);
  const t = buildTimeline(
    [{ stage: "vlm", wall_seconds: 10 }],
    {
      spans: [...spans, { ...spans[0], name: "unknown", seconds: null }],
      samples: [],
    },
    [],
  );
  assert.equal(t.origin, null);
  assert.equal(t.stages[0].interval, null);
  assert.deepEqual(
    t.stages[0].operations.map((s) => s.composition),
    [{ start: 0, end: 3 }, { start: 3, end: 7 }, null],
  );
  assert.ok(t.stages[0].operations.every((s) => s.interval === null));
  assert.equal(t.stages[0].seconds, 10);
});

test("different execution dates normalize independently and repeated attempts keep their own aligned rows", () => {
  const spans = [
    span("vlm", "generate", 2, 4, 1),
    span("vlm", "generate", 5, 8, 1),
  ];
  const a = buildTimeline([], { spans, samples: [] }, []);
  const b = buildTimeline(
    [],
    {
      spans: spans.map((s) => ({
        ...s,
        startedAt: s.startedAt + 86400000,
        endedAt: s.endedAt + 86400000,
      })),
      samples: [],
    },
    [],
  );
  assert.deepEqual(
    a.stages[0].operations.map((s) => s.interval),
    b.stages[0].operations.map((s) => s.interval),
  );
  assert.equal(phaseRows([a.stages[0], b.stages[0]]).length, 2);
  assert.notEqual(a.stages[0].operations[0].key, a.stages[0].operations[1].key);
});

test("importer joins device.json by archive and recovers JSON timestamps when a CSV is older", async () => {
  const files = ["a", "b"].flatMap((run, i) => [
    source(`local/${run}/variant.json`, { experiment_id: "x" }),
    source(`local/${run}/v/result.json`, { video: "v" }),
    source(`local/${run}/v/timings.json`, {
      stages: [
        {
          stage: "vlm",
          started_at: iso(0),
          ended_at: iso(10),
          wall_seconds: 10,
          spans: [
            {
              name: "generate",
              window: 1,
              seconds: 5,
              started_at: iso(2),
              ended_at: iso(7),
            },
          ],
        },
      ],
    }),
    source(
      `local/${run}/performance/v.csv`,
      "experiment,video,stage,span,window,seconds,vram_reserved_mib,vram_allocated_mib\nx,v,vlm,generate,1,5,2048,1024\n",
    ),
    source(`local/${run}/performance/device.json`, {
      devices: [{ name: `GPU ${i}`, total_memory_mib: 4096 }],
      host: { cpu_model: "CPU", cpu_count: 8, ram_total_mib: 16384 },
    }),
  ]);
  const runs = await importFiles(files, "new");
  const a = await loadDetails(runs[0]),
    b = await loadDetails(runs[1]);
  assert.equal(a.hardware.device!.devices[0].name, "GPU 0");
  assert.equal(b.hardware.device!.devices[0].name, "GPU 1");
  assert.equal(a.hardware.spans[0].startedAt, base + 2000);
  assert.equal(a.hardware.spans[0].reserved, 2048);
  assert.equal(
    a.sources.filter((s) => s.path.endsWith("device.json")).length,
    1,
  );
});

test("bad optional timestamps preserve durations and sample grids with a notice", () => {
  const warnings: string[] = [];
  const spans = parsePerformanceCsv(
    `experiment,video,stage,span,window,started_at,ended_at,seconds\nx,v,vlm,generate,1,${iso(8)},${iso(2)},6\n`,
    { experiment: "x", video: "v" },
    warnings,
  );
  const samples = parseResourceCsv(
    "timestamp,t_seconds,vram_device_mib\nbad,5,1024\n",
    warnings,
  );
  assert.equal(spans[0].seconds, 6);
  assert.equal(spans[0].startedAt, undefined);
  assert.equal(samples[0].t, 5);
  assert.equal(samples[0].timestamp, undefined);
  assert.ok(warnings.some((w) => w.includes("invalid timestamp")));
});

test("samples with a missing timestamp retain the anchored grid when a stage starts earlier", () => {
  const samples = [
    { t: 0, vram: 100, ram: 100, cpu: null },
    { t: 5, timestamp: base + 10000, vram: 200, ram: 200, cpu: 1 },
    { t: 10, vram: 300, ram: 300, cpu: 1 },
  ];
  const t = buildTimeline(
    [{ stage: "vlm", started_at: iso(1), ended_at: iso(25) }],
    { spans: [], samples },
    [],
  );
  assert.equal(t.origin, base + 1000);
  assert.deepEqual(
    t.samples.map((s) => s.t),
    [4, 9, 14],
  );
});
