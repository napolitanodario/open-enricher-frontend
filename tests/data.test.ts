import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluationState,
  transcriptFor,
  mergeWindows,
  importFiles,
  loadDetails,
  isCached,
  findFrame,
} from "../lib/data";
function file(path: string, value: unknown): File {
  const f = new File(
    [typeof value === "string" ? value : JSON.stringify(value)],
    path.split("/").pop()!,
  );
  Object.defineProperty(f, "webkitRelativePath", { value: path });
  return f;
}
const variant = { experiment_id: "same-configuration", interval_seconds: 300 };
const dialogue = {
  scenes: [
    { start_time: "00:00:00", end_time: "00:05:00", description: "Scene" },
  ],
};
test("failed evaluator fallback is never treated as a quality measurement", () => {
  assert.equal(
    evaluationState({ overall: 1, error: "Provider timeout" }),
    "failed",
  );
  assert.equal(
    evaluationState({ overall: 3, parse_errors: ["invalid"] }),
    "failed",
  );
  assert.equal(evaluationState({ overall: 3.05, parse_errors: [] }), "valid");
  assert.equal(evaluationState(null), "missing");
});
test("transcript joins include boundary-spanning lines but exclude adjacent lines", () => {
  const lines = [
    { start_timestamp: 299, end_timestamp: 301 },
    { start_timestamp: 300, end_timestamp: 302 },
    { start_timestamp: 295, end_timestamp: 300 },
  ];
  assert.equal(transcriptFor(lines, 0, 300).length, 2);
  assert.equal(transcriptFor(lines, 300, 600).length, 2);
});
test("frame and metadata joins reject mismatched time boundaries", () => {
  const warnings: string[] = [];
  const windows = mergeWindows(
    dialogue,
    { scene_timeline: [{ start_time: "00:00:01", end_time: "00:05:00" }] },
    {
      spans: [
        {
          window: 1,
          start: "00:00:00",
          end: "00:04:59",
          frames: [{ file: "wrong.jpg" }],
        },
      ],
    },
    warnings,
  );
  assert.equal(windows[0].frames.length, 0);
  assert.deepEqual(windows[0].visual, {});
  assert.equal(warnings.length, 2);
});
test("two executions of one configuration retain distinct identity and immutable frame paths", async () => {
  const files = ["run-a", "run-b"].flatMap((run) => [
    file(`export/runs/local/${run}/variant.json`, variant),
    file(`export/runs/local/${run}/run.json`, { run_id: run }),
    file(
      `export/runs/local/${run}/episode.mkv/episode.mkv_dialogue.json`,
      dialogue,
    ),
    file(`export/runs/local/${run}/episode.mkv/result.json`, {
      video: "episode.mkv",
      stages: [{ stage: "audio", status: "skipped_cache" }],
    }),
  ]);
  files.push(
    file(
      "export/runs/local/_cache/episode.mkv/frames/run-a/scene_01/frame_01.jpg",
      "image",
    ),
  );
  const runs = await importFiles(files, "session");
  assert.equal(runs.length, 2);
  assert.notEqual(runs[0].id, runs[1].id);
  assert.equal(runs[0].config.experiment_id, runs[1].config.experiment_id);
  assert.equal(isCached(runs[0], "audio"), true);
  assert.ok(
    findFrame(
      runs[0],
      "runs/local/_cache/episode.mkv/frames/run-a/scene_01/frame_01.jpg",
    ),
  );
  assert.equal(findFrame(runs[0], "../outside.jpg"), undefined);
});
test("malformed optional JSON degrades one panel and preserves raw source access", async () => {
  const runs = await importFiles(
    [
      file("export/run/variant.json", variant),
      file("export/run/episode/episode_dialogue.json", dialogue),
      file("export/run/episode/episode_llm.json", "{ broken"),
      file("export/synopsis/episode_summary.txt", "Reference text"),
    ],
    "session",
  );
  const details = await loadDetails(runs[0]);
  assert.equal(details.windows.length, 1);
  assert.equal(details.synopsis, "Reference text");
  assert.ok(details.warnings.some((w) => w.includes("episode_llm.json")));
  assert.equal(details.sources.length, 4);
});
test("individual-file fallback supports one video without directory metadata", async () => {
  const files = [new File([JSON.stringify(dialogue)], "episode_dialogue.json")];
  const runs = await importFiles(files, "flat");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].video, "episode");
  assert.ok(runs[0].warnings.some((w) => w.includes("hierarchy")));
});
test("sixty independent runs are indexed without collapsing identical configurations", async () => {
  const files = Array.from({ length: 60 }, (_, i) => [
    file(`archive/run-${i}/variant.json`, variant),
    file(`archive/run-${i}/video/video_dialogue.json`, dialogue),
  ]).flat();
  const runs = await importFiles(files, "large");
  assert.equal(runs.length, 60);
  assert.equal(new Set(runs.map((r) => r.id)).size, 60);
});

test("future frame index attaches exact sample timestamps without inventing them", () => {
  const warnings: string[] = [];
  const windows = mergeWindows(
    dialogue,
    {},
    {
      spans: [
        {
          window: 1,
          start: "00:00:00",
          end: "00:05:00",
          frames: [
            {
              sample: 1,
              timestamp_seconds: 0,
              file: "runs/local/_cache/frame_01.jpg",
            },
            {
              sample: 2,
              timestamp_seconds: 299.958,
              file: "runs/local/_cache/frame_02.jpg",
            },
          ],
        },
      ],
    },
    warnings,
  );
  assert.deepEqual(
    windows[0].frames.map((f) => f.timestamp_seconds),
    [0, 299.958],
  );
  assert.equal(warnings.length, 0);
});
test("wrong-shaped optional artifacts do not crash window merging", () => {
  const warnings: string[] = [];
  assert.deepEqual(
    mergeWindows(
      { scenes: [null, "bad"] },
      { scene_timeline: [] },
      { spans: [null] },
      warnings,
    ),
    [],
  );
});

for (const root of ["local", "export/runs/local"]) {
  test(`late JPEGs recover failed captures when importing ${root}`, async () => {
    const manifest = {
      spans: [
        {
          window: 1,
          start: "00:00:00",
          end: "00:05:00",
          frames: [],
          error: "ffmpeg failed",
        },
      ],
    };
    const cache = `${root}/_cache/episode/frames/same-configuration/scene_01`;
    const files = [
      file(`${root}/experiment/variant.json`, variant),
      file(`${root}/experiment/episode/episode_dialogue.json`, dialogue),
      file(`${root}/experiment/episode/episode_vlm_frames.json`, manifest),
      ...Array.from({ length: 40 }, (_, i) =>
        file(`${cache}/frame_${40 - i}.jpg`, "image"),
      ),
      file(`${cache}/other.jpg`, "unrelated"),
      file(
        `${root}/_cache/other-video/frames/same-configuration/scene_01/frame_01.jpg`,
        "wrong video",
      ),
      file(
        `${root}/_cache/episode/frames/other-experiment/scene_01/frame_01.jpg`,
        "wrong experiment",
      ),
    ];
    const [run] = await importFiles(files, "late");
    const details = await loadDetails(run);
    const scene = details.windows[0];
    assert.equal(scene.frames.length, 40);
    assert.equal(scene.frameError, undefined);
    assert.deepEqual(
      scene.frames.map((f) => f.sample),
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    assert.ok(
      scene.frames.every(
        (f) =>
          f.recovered &&
          f.timestamp_seconds === undefined &&
          findFrame(run, f.file),
      ),
    );
    assert.ok(
      findFrame(
        run,
        "runs/local/_cache/episode/frames/same-configuration/scene_01/frame_1.jpg",
      ),
    );
    const original = run.files.find((s) =>
      s.path.endsWith("_vlm_frames.json"),
    )!;
    assert.deepEqual(JSON.parse(await original.file.text()), manifest);
  });
}

test("missing late JPEGs retain capture errors and mismatched boundaries reject recovery", async () => {
  for (const end of ["00:05:00", "00:04:59"]) {
    const [run] = await importFiles(
      [
        file("local/experiment/variant.json", variant),
        file("local/experiment/episode/episode_dialogue.json", dialogue),
        file("local/experiment/episode/episode_vlm_frames.json", {
          spans: [
            {
              window: 1,
              start: "00:00:00",
              end,
              frames: [],
              error: "capture failed",
            },
          ],
        }),
        ...(end === "00:04:59"
          ? [
              file(
                "local/_cache/episode/frames/same-configuration/scene_01/frame_01.jpg",
                "image",
              ),
            ]
          : []),
      ],
      "failed",
    );
    const details = await loadDetails(run);
    assert.equal(details.windows[0].frames.length, 0);
    if (end === "00:05:00")
      assert.equal(details.windows[0].frameError, "capture failed");
    else
      assert.ok(
        details.warnings.some((w) => w.includes("boundaries do not match")),
      );
  }
});

test("manifest timestamps survive stale errors and local-folder path resolution", async () => {
  const path =
    "runs/local/_cache/episode/frames/same-configuration/scene_01/frame_01.jpg";
  const [run] = await importFiles(
    [
      file("local/experiment/variant.json", variant),
      file("local/experiment/episode/episode_dialogue.json", dialogue),
      file("local/experiment/episode/episode_vlm_frames.json", {
        spans: [
          {
            window: 1,
            start: "00:00:00",
            end: "00:05:00",
            error: "stale error",
            frames: [{ file: path, timestamp_seconds: 12.5 }],
          },
        ],
      }),
      file(path.slice("runs/".length), "image"),
    ],
    "indexed",
  );
  const details = await loadDetails(run);
  assert.equal(details.windows[0].frames[0].timestamp_seconds, 12.5);
  assert.equal(details.windows[0].frames[0].recovered, undefined);
  assert.equal(details.windows[0].frameError, undefined);
});

test("late JPEGs work without a frame manifest and prefer immutable run scope", async () => {
  const [run] = await importFiles(
    [
      file("local/experiment/variant.json", variant),
      file("local/experiment/run.json", { run_id: "run-a" }),
      file("local/experiment/episode/episode_dialogue.json", dialogue),
      file(
        "local/_cache/episode/frames/run-a/scene_01/frame_01.jpg",
        "current",
      ),
      file(
        "local/_cache/episode/frames/same-configuration/scene_01/frame_02.jpg",
        "older",
      ),
    ],
    "no-manifest",
  );
  const details = await loadDetails(run);
  assert.equal(details.windows[0].frames.length, 1);
  assert.ok(details.windows[0].frames[0].file.includes("/run-a/"));
});
