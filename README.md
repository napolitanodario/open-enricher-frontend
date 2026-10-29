# OpenEnricher Experiment Explorer

A browser-local Next.js viewer for OpenEnricher pipeline archives. Inspect scene windows, sampled frames, diarized transcripts, metadata, evaluator reports and processing durations. Compare two executions of the same video, including repeats of one configuration.

## Run locally

Requires Node.js 20.9+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and enter **1234**. This fixed client-side password is a convenience screen, not authentication. The initial demo contains explicitly illustrative text and frame placeholders. It contains no real pipeline dataset.

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

The importer retains the pipeline's JSON formats. It resolves repository-relative frame paths against imported files, including the `_cache` directory. Selecting only the run directory omits a sibling cache or synopsis: select their common parent to include them. Input may be incomplete; unavailable artifacts and malformed JSON produce notices while original files remain inspectable.

The individual-file button next to Import folder is a fallback for **one video from one run at a time**; browsers do not provide directory hierarchy for ordinary file selection. Use folder selection for multiple runs and frame paths.

Data stays in tab memory and is not uploaded or saved in a database. Refreshing requires selecting the files again. Folder imports are snapshots; use reimport to see subsequent pipeline updates. Clear all imports returns to the illustrative workspace. Locking hides the workspace without discarding its current imports.

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
- Placeholder slots have no invented sampled timestamps. Future frame indexes use `spans[].window`, boundaries and `frames[].timestamp_seconds` / `file`.
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

The supplied GitHub Actions workflow builds and deploys pushes to `main` (or manual dispatch). Enable **Settings → Pages → Source: GitHub Actions** in the frontend repository. Publishing requires a plan/repository configuration that supports Pages. No backend repository access or credentials are needed. Only application code and illustrative demo data are deployed; imported files are never included in the build.

Query parameters retain tab, window, video, stable run ID and comparison. After a reload, import the matching archives again to restore selection. Legacy import identities are session-local.

See [DESIGN_PROPOSAL.md](DESIGN_PROPOSAL.md) for the agreed scope and proposed optional pipeline improvements.
