import { test } from "node:test";
import assert from "node:assert/strict";
import { importFiles, isCached, loadDetails } from "../lib/data";
import {
  nearestSample,
  parsePerformanceCsv,
  parseResourceCsv,
  peak,
  resourceSegments,
} from "../lib/performance";

const spanHeader =
  "experiment,video,stage,span,window,seconds,vram_reserved_mib,vram_allocated_mib\n";
const seriesHeader = "t_seconds,vram_device_mib,ram_mib,cpu_cores\n";
function file(path: string, value: unknown): File {
  const f = new File(
    [typeof value === "string" ? value : JSON.stringify(value)],
    path.split("/").pop()!,
  );
  Object.defineProperty(f, "webkitRelativePath", { value: path });
  return f;
}

test("pipeline CSV preserves quoted video identities, blank windows, zero peaks and repeated operations", () => {
  const video = 'Episode, "pilot".mkv';
  const notices: string[] = [];
  const rows = parsePerformanceCsv(
    "\uFEFF" +
      spanHeader.replace(/\n/g, "\r\n") +
      'experiment,"Episode, ""pilot"".mkv",vlm,vlm_generate,1,12.5,2048,1024\r\n' +
      'experiment,"Episode, ""pilot"".mkv",vlm,vlm_generate,1,1,0,0\r\n' +
      'experiment,"Episode, ""pilot"".mkv",audio,load,,3,,\r\n',
    { experiment: "experiment", video },
    notices,
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    stage: "vlm",
    name: "vlm_generate",
    window: 1,
    seconds: 12.5,
    reserved: 2048,
    allocated: 1024,
  });
  assert.equal(rows[1].reserved, 0);
  assert.equal(rows[2].window, null);
  assert.equal(rows[2].reserved, null);
  assert.deepEqual(notices, []);
});

test("hardware samples retain every valid row and missing CPU is not zero or percent", () => {
  const notices: string[] = [];
  const samples = parseResourceCsv(
    seriesHeader + "0,512,1024,\n5,6144.5,2048.5,3.5\n10,,0,0\n",
    notices,
  );
  assert.deepEqual(samples, [
    { t: 0, vram: 512, ram: 1024, cpu: null },
    { t: 5, vram: 6144.5, ram: 2048.5, cpu: 3.5 },
    { t: 10, vram: null, ram: 0, cpu: 0 },
  ]);
  assert.equal(peak(samples.map((s) => s.cpu)), 3.5);
  assert.equal(peak([null, null]), null);
  assert.deepEqual(notices, []);
});

test("invalid samples are reported without fabricating measurements; older two-column CSVs work", () => {
  const notices: string[] = [];
  const samples = parseResourceCsv(
    seriesHeader +
      "5,2048,-5,Infinity\n0,1024,,\n5,4096,100,1\n-1,200,200,1\n10,bad,512,0\n",
    notices,
  );
  assert.deepEqual(
    samples.map((s) => s.t),
    [0, 5, 10],
  );
  assert.equal(samples[1].ram, null);
  assert.equal(samples[1].cpu, null);
  assert.equal(samples[2].vram, null);
  assert.ok(notices.some((w) => w.includes("duplicate")));
  assert.ok(notices.some((w) => w.includes("invalid measurements")));
  assert.ok(notices.some((w) => w.includes("reordered")));
  assert.deepEqual(parseResourceCsv("t_seconds,vram_device_mib\n0,50\n", []), [
    { t: 0, vram: 50, ram: null, cpu: null },
  ]);
});

test("plots split on missing readings and sampling gaps, and cursor does not extrapolate", () => {
  const samples = parseResourceCsv(
    seriesHeader +
      "0,100,20,\n5,200,20,1\n10,,20,1\n15,400,20,1\n30,500,20,1\n",
    [],
  );
  assert.deepEqual(
    resourceSegments(samples, "vram").map((segment) => segment.map((s) => s.t)),
    [[0, 5], [15], [30]],
  );
  assert.equal(nearestSample(samples, 3)?.t, 5);
  assert.equal(nearestSample(samples, 10)?.vram, null);
  assert.equal(nearestSample(samples, 23), undefined);
  assert.equal(nearestSample(samples, 31), undefined);
  assert.equal(nearestSample(samples, -1), undefined);
});

test("run-scoped CSV lookup separates repeated configurations and videos and exposes originals", async () => {
  const files = ["run-a", "run-b"].flatMap((run, i) => [
    file(`export/local/${run}/variant.json`, { experiment_id: "same-config" }),
    file(`export/local/${run}/run.json`, { run_id: run }),
    file(`export/local/${run}/episode.mkv/result.json`, {
      video: "episode.mkv",
      stages: [{ stage: "vlm", status: "skipped_cache" }],
    }),
    file(`export/local/${run}/episode.mkv/timings.json`, {
      stages: [
        {
          stage: "vlm",
          wall_seconds: 50,
          spans: [
            {
              name: "vlm_generate",
              window: 1,
              seconds: 30,
              model_id: "model",
              attempt: 1,
              vram_reserved_mib: 999,
            },
          ],
        },
      ],
    }),
    file(
      `export/local/${run}/performance/episode.mkv.csv`,
      spanHeader +
        `same-config,episode.mkv,vlm,vlm_generate,1,30,${2048 + i},1024\n`,
    ),
    file(
      `export/local/${run}/performance/episode.mkv_vram.csv`,
      seriesHeader + `0,${512 + i},1024,\n`,
    ),
    file(
      `export/local/${run}/performance/other.mkv_vram.csv`,
      seriesHeader + "0,9999,9999,9\n",
    ),
  ]);
  const runs = await importFiles(files, "import");
  const [a, b] = await Promise.all(runs.map(loadDetails));
  assert.equal(a.hardware.samples[0].vram, 512);
  assert.equal(b.hardware.samples[0].vram, 513);
  assert.equal(a.hardware.spans.length, 1);
  assert.equal(a.hardware.spans[0].reserved, 2048);
  assert.equal(a.hardware.spans[0].modelId, "model");
  assert.equal(a.timings.stages[0].spans[0].model_id, "model");
  assert.equal(a.timings.stages[0].wall_seconds, 50);
  assert.equal(isCached(runs[0], "vlm"), true);
  assert.equal(a.sources.filter((s) => s.path.endsWith(".csv")).length, 2);
  assert.ok(!a.sources.some((s) => s.path.includes("other.mkv")));
});

test("CSV operation durations work without timing JSON and never become stage wall durations", async () => {
  const [run] = await importFiles(
    [
      file("local/experiment/episode/result.json", { video: "episode" }),
      file(
        "local/experiment/performance/episode.csv",
        spanHeader + "experiment,episode,vlm,vlm_generate,1,30,2048,1024\n",
      ),
    ],
    "import",
  );
  const details = await loadDetails(run);
  assert.equal(details.timings.stages[0].spans[0].seconds, 30);
  assert.equal(details.timings.stages[0].wall_seconds, undefined);
  assert.deepEqual(details.hardware.samples, []);
});

test("missing and broken CSVs preserve legacy timing evidence and raw file access", async () => {
  const [run] = await importFiles(
    [
      file("local/experiment/episode/result.json", { video: "episode" }),
      file("local/experiment/episode/episode_vlm_timings.json", {
        stage: "vlm",
        wall_seconds: 31,
        spans: [{ name: "vlm_generate", seconds: 30, vram_reserved_mib: 2048 }],
      }),
      file("local/experiment/performance/episode.csv", spanHeader + '"broken'),
      file(
        "local/experiment/performance/episode_vram.csv",
        "wrong,columns\n0,2\n",
      ),
    ],
    "import",
  );
  const details = await loadDetails(run);
  assert.equal(details.hardware.spans[0].reserved, 2048);
  assert.equal(details.hardware.spans[0].allocated, null);
  assert.equal(details.hardware.samples.length, 0);
  assert.ok(details.warnings.some((w) => w.includes("Unterminated")));
  assert.ok(details.warnings.some((w) => w.includes("Expected CSV columns")));
  assert.equal(details.sources.length, 4);
});

test("performance rows with conflicting identities are ignored and invalid fields stay unavailable", () => {
  const notices: string[] = [];
  const rows = parsePerformanceCsv(
    spanHeader +
      "wrong,episode,vlm,generate,1,2,100,50\nexperiment,other,vlm,generate,1,2,100,50\nexperiment,episode,vlm,generate,1.5,-1,NaN,0\n",
    { experiment: "experiment", video: "episode" },
    notices,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].window, null);
  assert.equal(rows[0].seconds, null);
  assert.equal(rows[0].reserved, null);
  assert.equal(rows[0].allocated, 0);
  assert.ok(notices.some((w) => w.includes("2 performance row(s) skipped")));
});
