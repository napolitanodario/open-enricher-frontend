export type Doc = Record<string, any>;
export type SourceFile = { path: string; file: File };
export type Run = {
  id: string;
  importId: string;
  folder: string;
  label: string;
  video: string;
  config: Doc;
  manifest: Doc;
  result: Doc;
  score: Doc | null;
  files: SourceFile[];
  allFiles: SourceFile[];
  warnings: string[];
};
export type WindowData = {
  start: number;
  end: number;
  dialogue: Doc;
  visual: Doc;
  frames: Doc[];
  frameError?: string;
};
export type Details = {
  audio: Doc[];
  dialogue: Doc;
  vlm: Doc;
  profile: Doc;
  timings: Doc;
  windows: WindowData[];
  synopsis: string;
  sources: SourceFile[];
  warnings: string[];
};
export function seconds(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  if (!value.includes(":")) return Number(value);
  return value.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
}
export function clock(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const s = Math.max(0, Math.floor(value));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function duration(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value >= 60
    ? `${(value / 60).toFixed(1)} min`
    : `${value.toFixed(2)} s`;
}
export function evaluationState(
  score: Doc | null,
): "valid" | "failed" | "missing" {
  if (!score) return "missing";
  if (
    score.error ||
    score.parse_errors?.length ||
    !Number.isFinite(score.overall) ||
    score.overall < 1 ||
    score.overall > 5
  )
    return "failed";
  if (
    score.dimensions &&
    (typeof score.dimensions !== "object" ||
      Array.isArray(score.dimensions) ||
      Object.values(score.dimensions).some(
        (d: any) =>
          !d || !Number.isFinite(d.score) || d.score < 1 || d.score > 5,
      ))
  )
    return "failed";
  return "valid";
}
export function transcriptFor(audio: Doc[], start: number, end: number): Doc[] {
  return audio.filter(
    (line) =>
      seconds(line.start_timestamp) < end &&
      seconds(line.end_timestamp) > start,
  );
}
export function isCached(run: Run, stage: string) {
  return run.result.stages?.some(
    (s: Doc) =>
      s.stage === stage && ["skipped_cache", "cached"].includes(s.status),
  );
}
function normalize(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}
async function json(
  source: SourceFile | undefined,
  warnings: string[],
): Promise<Doc | Doc[] | null> {
  if (!source) return null;
  try {
    const value = JSON.parse(await source.file.text());
    if (!value || typeof value !== "object")
      throw new Error("Expected JSON object or array");
    return value;
  } catch (e) {
    warnings.push(
      `${source.path}: ${e instanceof Error ? e.message : "Invalid JSON"}`,
    );
    return null;
  }
}
function object(value: Doc | Doc[] | null): Doc {
  return value && !Array.isArray(value) ? value : {};
}
export async function importFiles(
  input: File[],
  importId: string,
): Promise<Run[]> {
  const hasHierarchy = input.some((file) =>
    file.webkitRelativePath?.includes("/"),
  );
  if (!hasHierarchy && new Set(input.map((f) => f.name)).size !== input.length)
    throw new Error(
      "Duplicate filenames in individual-file selection. Use folder import to retain run boundaries.",
    );
  const allFiles = input.map((file) => ({
    file,
    path: normalize(
      file.webkitRelativePath ||
        (hasHierarchy
          ? file.name
          : `local-import/single-run/video/${file.name}`),
    ),
  }));
  // Per-video directories, rather than the configuration name, identify archive boundaries.
  const folders = new Set(
    allFiles
      .filter(
        (s) =>
          /(?:_audio|_dialogue|_vlm|_llm)\.json$/.test(s.path) ||
          /\/result\.json$/.test(s.path),
      )
      .map((s) => s.path.slice(0, s.path.lastIndexOf("/"))),
  );
  const runs: Run[] = [];
  for (const folder of folders) {
    if (!folder || folder.includes("/_cache/")) continue;
    const warnings: string[] = [];
    if (!hasHierarchy)
      warnings.push(
        "Individual-file import: hierarchy is unavailable. Import one video from one run at a time.",
      );
    const files = allFiles.filter(
      (s) => s.path.slice(0, s.path.lastIndexOf("/")) === folder,
    );
    const parent = folder.slice(0, folder.lastIndexOf("/"));
    const find = (path: string) => allFiles.find((s) => s.path === path);
    const manifest = object(await json(find(`${parent}/run.json`), warnings));
    const config = object(await json(find(`${parent}/variant.json`), warnings));
    for (const key of [
      "run_id",
      "experiment_id",
      "started_at",
      "source_commit",
    ]) {
      if (manifest[key] !== undefined && typeof manifest[key] !== "string") {
        warnings.push(`run.json: ${key} must be a string.`);
        delete manifest[key];
      }
    }
    for (const key of ["experiment_id", "title"]) {
      if (config[key] !== undefined && typeof config[key] !== "string") {
        warnings.push(`variant.json: ${key} must be a string.`);
        delete config[key];
      }
    }
    if (
      config.interval_seconds !== undefined &&
      (!Number.isFinite(config.interval_seconds) ||
        config.interval_seconds <= 0)
    ) {
      warnings.push("variant.json: invalid interval_seconds.");
      delete config.interval_seconds;
    }
    if (
      config.vlm_memory_scenes !== undefined &&
      config.vlm_memory_scenes !== null &&
      !Number.isFinite(config.vlm_memory_scenes)
    ) {
      warnings.push("variant.json: invalid vlm_memory_scenes.");
      delete config.vlm_memory_scenes;
    }
    const result = object(
      await json(
        files.find((s) => s.path.endsWith("/result.json")),
        warnings,
      ),
    );
    result.stages = Array.isArray(result.stages)
      ? result.stages.filter((s: Doc) => s && typeof s.stage === "string")
      : [];
    if (typeof result.video !== "string") delete result.video;
    if (typeof result.status !== "string") delete result.status;
    const artifact = files.find((s) =>
      /_(audio|dialogue|vlm|llm)\.json$/.test(s.path),
    );
    const video =
      result.video ||
      artifact?.path
        .split("/")
        .pop()
        ?.replace(/_(audio|dialogue|vlm|llm)\.json$/, "") ||
      folder.split("/").pop() ||
      "Unknown video";
    const scoreValue = await json(
      files.find((s) => s.path.endsWith("/score.json")),
      warnings,
    );
    const score = scoreValue && !Array.isArray(scoreValue) ? scoreValue : null;
    if (!config.experiment_id)
      config.experiment_id =
        manifest.experiment_id ||
        parent.split("/").pop() ||
        "Imported experiment";
    if (!manifest.run_id)
      warnings.push(
        "Legacy archive: run identity is local to this import. Execution date is unavailable.",
      );
    runs.push({
      id: `${importId}:${folder}`,
      importId,
      folder,
      label: manifest.run_id || parent.split("/").pop() || folder,
      video,
      config,
      manifest,
      result,
      score,
      files,
      allFiles,
      warnings,
    });
  }
  if (!runs.length)
    throw new Error(
      "No run folders found. Select a parent folder containing per-video *_audio.json, *_dialogue.json, *_vlm.json or *_llm.json artifacts.",
    );
  return runs;
}
export function findFrame(run: Run, path: string): SourceFile | undefined {
  const target = normalize(path);
  if (!target || target.split("/").includes("..")) return undefined;
  const matches = run.allFiles.filter(
    (s) => s.path === target || s.path.endsWith(`/${target}`),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function mergeWindows(
  dialogue: Doc,
  vlm: Doc,
  frames: Doc,
  warnings: string[],
): WindowData[] {
  const ds: Doc[] = Array.isArray(dialogue.scenes)
    ? dialogue.scenes.filter((v: unknown) => v && typeof v === "object")
    : [];
  const vs: Doc[] = Array.isArray(vlm.scene_timeline)
    ? vlm.scene_timeline.filter((v: unknown) => v && typeof v === "object")
    : [];
  const base = ds.length ? ds : vs;
  const spans: Doc[] = Array.isArray(frames.spans)
    ? frames.spans.filter((v: unknown) => v && typeof v === "object")
    : [];
  const windows = base.map((d, index) => {
    const start = seconds(d.start_seconds ?? d.start_time),
      end = seconds(d.end_seconds ?? d.end_time);
    const visual =
      vs.find(
        (v) => seconds(v.start_time) === start && seconds(v.end_time) === end,
      ) || {};
    const frameSpan = spans.find(
      (f) =>
        f.window === index + 1 &&
        seconds(f.start) === start &&
        seconds(f.end) === end,
    );
    if (ds.length && vs.length && !Object.keys(visual).length)
      warnings.push(
        `Window ${index + 1}: VLM boundaries do not match dialogue boundaries.`,
      );
    if (spans.some((f) => f.window === index + 1) && !frameSpan)
      warnings.push(
        `Window ${index + 1}: frame boundaries do not match; frames were not attached.`,
      );
    return {
      start,
      end,
      dialogue: ds.length ? d : {},
      visual,
      frames: Array.isArray(frameSpan?.frames)
        ? frameSpan.frames.filter(
            (f: Doc) =>
              f &&
              typeof f === "object" &&
              Number.isFinite(f.timestamp_seconds) &&
              typeof f.file === "string",
          )
        : [],
      frameError: frameSpan?.error ? String(frameSpan.error) : undefined,
    };
  });
  if (vs.length && ds.length && ds.length !== vs.length)
    warnings.push(
      "Dialogue and VLM window counts differ. Inspect the original files.",
    );
  return windows.filter((w, index) => {
    const valid =
      Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start;
    if (!valid) warnings.push(`Window ${index + 1}: invalid time boundaries.`);
    return valid;
  });
}
export async function loadDetails(run: Run): Promise<Details> {
  const warnings = [...run.warnings];
  const read = async (suffix: string) =>
    json(
      run.files.find((s) => s.path.endsWith(suffix)),
      warnings,
    );
  const [a, d, v, p, f, t] = await Promise.all(
    [
      "_audio.json",
      "_dialogue.json",
      "_vlm.json",
      "_llm.json",
      "_vlm_frames.json",
      "/timings.json",
    ].map(read),
  );
  const dialogue = object(d),
    vlm = object(v),
    profile = object(p);
  let timings = object(t);
  if (!Array.isArray(timings.stages)) {
    const docs = await Promise.all(
      run.files
        .filter((s) => s.path.endsWith("_timings.json"))
        .map((s) => json(s, warnings)),
    );
    timings = { stages: docs.filter((x) => x && !Array.isArray(x)) };
  }
  const synopsisCandidates = run.allFiles.filter(
    (s) =>
      s.path.endsWith(`/synopsis/${run.video}_summary.txt`) ||
      s.path === `synopsis/${run.video}_summary.txt`,
  );
  const synopsis =
    synopsisCandidates.length === 1
      ? await synopsisCandidates[0].file.text()
      : "";
  if (synopsisCandidates.length > 1)
    warnings.push(
      "Multiple reference synopses found. Import one unambiguous reference.",
    );
  timings.stages = (Array.isArray(timings.stages) ? timings.stages : [])
    .filter((s: Doc) => s && typeof s.stage === "string")
    .map((s: Doc) => ({
      ...s,
      spans: Array.isArray(s.spans)
        ? s.spans.filter((v: Doc) => v && typeof v.name === "string")
        : [],
    }));
  if (d && !Array.isArray((d as Doc).scenes))
    warnings.push("Dialogue artifact: expected scenes array.");
  if (v && !Array.isArray((v as Doc).scene_timeline))
    warnings.push("VLM artifact: expected scene_timeline array.");
  if (Array.isArray(a))
    for (const line of a) {
      if (line && typeof line === "object" && typeof line.speaker !== "string")
        line.speaker = "UNKNOWN";
    }
  const frameDocument = object(f);
  if (
    Array.isArray(frameDocument.spans) &&
    frameDocument.spans.some(
      (span: Doc) =>
        Array.isArray(span?.frames) &&
        span.frames.some(
          (frame: Doc) =>
            typeof frame?.file === "string" &&
            frame.file.includes(`/frames/${run.config.experiment_id}/`),
        ),
    )
  ) {
    warnings.push(
      "Frame paths are configuration-scoped. Repeating this configuration may overwrite earlier frame evidence; immutable run-specific paths are recommended.",
    );
  }
  const windows = mergeWindows(dialogue, vlm, frameDocument, warnings);
  if (a && !Array.isArray(a))
    warnings.push("Audio artifact: expected an array of transcript lines.");
  return {
    audio: Array.isArray(a)
      ? a.filter(
          (l: Doc) =>
            l &&
            typeof l.text === "string" &&
            Number.isFinite(seconds(l.start_timestamp)) &&
            Number.isFinite(seconds(l.end_timestamp)),
        )
      : [],
    dialogue,
    vlm,
    profile,
    timings,
    windows,
    synopsis,
    sources: [
      ...run.files,
      ...run.allFiles.filter(
        (s) =>
          s.path ===
            `${run.folder.slice(0, run.folder.lastIndexOf("/"))}/variant.json` ||
          s.path ===
            `${run.folder.slice(0, run.folder.lastIndexOf("/"))}/run.json`,
      ),
      ...synopsisCandidates,
    ],
    warnings,
  };
}
