# OpenEnricher Experiment Explorer

A browser-local Next.js viewer for OpenEnricher pipeline archives. Inspect scene windows, sampled frames, diarized transcripts, metadata, evaluator reports and processing durations. Compare two executions of the same video, including repeats of one configuration.

## Run locally

Requires Node.js 20.9+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and enter **1234**. This fixed client-side password is a convenience screen, not authentication. The workspace starts empty. Import an archive folder to inspect its results; no example dataset is bundled.

## Import pipeline results

Choose **Import folder** and select a common parent folder containing original archives and optional synopsis/frame files:

```text
export/
  synopsis/<video>_summary.txt
  runs/local/
    <experiment-or-run>/
      variant.json
      run.json                   # optional, recommended for repeated runs
      <video>/
        result.json
        score.json
        timings.json
        <video>_audio.json
        <video>_dialogue.json
        <video>_vlm.json
        <video>_vlm_frames.json   # optional
        <video>_llm.json
    _cache/<video>/frames/<experiment>/scene_01/frame_01.jpg
```

The importer retains the pipeline's JSON formats. It resolves repository-relative frame paths against imported files, including when selecting `local` directly with its `_cache` directory. Selecting only the run directory omits a sibling cache or synopsis: select their common parent to include them. Input may be incomplete; unavailable artifacts and malformed JSON produce notices while original files remain inspectable.

JPEGs generated after a failed capture are also supported: include them under `_cache/<video>/frames/<experiment_id>/scene_01/frame_01.jpg` (or use a run ID instead of the experiment ID for immutable evidence), then reimport the folder. When a scene has no indexed samples, the viewer discovers `frame_<number>.jpg` / `.jpeg` files and orders them numerically, even if `_vlm_frames.json` is absent or records a capture error. An available recovered image suppresses the old capture error in the scene panel; the original JSON remains inspectable. Recovery never overrides conflicting scene boundaries. Without indexed timestamps, recovered images can be browsed but have no dialogue synchronization; timestamps are not guessed from filenames. An existing frame index retains its recorded timestamps.

Import one folder at a time. Additional folders can be imported into the same workspace, keeping repeated executions distinct.

Data stays in tab memory and is not uploaded or saved in a database. Refreshing requires selecting the files again. Folder imports are snapshots; use reimport to see subsequent pipeline updates. Clear all imports returns to the empty catalog. Locking hides the workspace without discarding its current imports.

### Repeated runs

Prefer a different archive folder for every execution, containing `run.json`:

```json
{
  "schema_version": 1,
  "run_id": "20261029T103000Z-01-scene-context-a7c2",
  "experiment_id": "01-scene-context",
  "started_at": "2026-10-29T10:30:00Z",
  "source_commit": "full pipeline commit SHA"
}
```

The manifest is an optional proposed pipeline addition. Legacy archives get a visibly local identity based on import session and folder, so importing several snapshots keeps them distinct. Reimporting an existing stable run ID asks whether to replace it. To preserve historical evidence upstream, also store frames under immutable run-specific paths. The viewer cannot recover artifacts overwritten by the pipeline.

### Interpreting evidence

- Scenes are the pipeline's fixed analysis windows, not detected cuts.
- Transcript speaker IDs are preserved. No character identities are guessed.
- Missing frames display an unavailable state, with no invented samples or timestamps. Frame indexes use `spans[].window`, boundaries and `frames[].timestamp_seconds` / `file`; later JPEG exports can be browsed without timestamps as described above.
- Transcript clicks select an inspection instant and the nearest frame; subtitles apply only at the selected instant.
- Evaluator errors and parse failures are excluded from score comparisons, even when the report contains fallback numerical scores.
- Duration bars start at zero. Precise waterfalls require execution offsets not present in current timing files. VLM window processing may include clip preparation/frame capture. Cached stages show original computation separately and are excluded from executed-duration sums.
- The pipeline diagram documents known dependencies. It is not an exported DAG or execution schedule.
- Video playback is outside this first release.

## Verify and export

```sh
npm test
npm run typecheck
npm run build
```

The `out/` directory is a standalone static site. To build for the repository's GitHub Pages path:

```sh
NEXT_PUBLIC_BASE_PATH=/open-enricher-frontend npm run build
```

The supplied GitHub Actions workflow builds and deploys pushes to `main` (or manual dispatch). Enable **Settings → Pages → Source: GitHub Actions** in the frontend repository. Publishing requires a plan/repository configuration that supports Pages. No backend repository access or credentials are needed. Only application code and self-hosted UI fonts are deployed; imported files are never included in the build.

Query parameters retain tab, window, video, stable run ID and comparison. After a reload, import the matching archives again to restore selection. Legacy import identities are session-local.

See [DESIGN_PROPOSAL.md](DESIGN_PROPOSAL.md) for the agreed scope and proposed optional pipeline improvements.

## Evaluation reports

The explorer displays existing `score.json` reports generated by the OpenEnricher pipeline. It does not run evaluations or contact AI providers. Realtime evaluation is deferred and outside the current scope. See [docs/EVALUATION.md](docs/EVALUATION.md) for the supported workflow.

## Link after GitHub Pages deployment

https://napolitanodario.github.io/open-enricher-frontend/
