"use client";

import { useEffect, useRef, useState } from "react";
import { JsonCode } from "@/app/json-code";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns2,
  Film,
  FolderOpen,
  GitBranch,
  Image as ImageIcon,
  Info,
  Layers3,
  ListFilter,
  LockKeyhole,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  clock,
  Details,
  Doc,
  duration,
  evaluationState,
  findFrame,
  importFiles,
  isCached,
  loadDetails,
  Run,
  seconds,
  transcriptFor,
  WindowData,
} from "@/lib/data";

type Tab = "Scenes" | "Overview" | "Performance" | "Pipeline";
const tabs: Tab[] = ["Scenes", "Overview", "Performance", "Pipeline"];
const stageNames: Record<string, string> = {
  audio: "Audio & speakers",
  dialogue: "Dialogue understanding",
  vlm: "Visual understanding",
  llm: "Metadata synthesis",
};
function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Info size={22} />
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}
function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function EvaluationBadge({ score }: { score: Doc | null }) {
  const state = evaluationState(score);
  return (
    <Badge
      tone={state === "valid" ? "green" : state === "failed" ? "amber" : ""}
    >
      {state === "valid"
        ? `${score!.overall.toFixed(2)} / 5`
        : state === "failed"
          ? "Evaluation failed"
          : "Not evaluated"}
    </Badge>
  );
}
function Tags({ values }: { values: unknown }) {
  return (
    <div className="tags">
      {Array.isArray(values) && values.length ? (
        values.map((v, i) => <span key={i}>{String(v)}</span>)
      ) : (
        <span className="muted">Not provided</span>
      )}
    </div>
  );
}
function TextField({ label, value }: { label: string; value: unknown }) {
  return (
    <section className="text-field">
      <h4>{label}</h4>
      <p>{typeof value === "string" && value ? value : "Not provided"}</p>
    </section>
  );
}

export default function Home() {
  const [unlocked, setUnlocked] = useState(false),
    [password, setPassword] = useState(""),
    [passwordError, setPasswordError] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]),
    [selected, setSelected] = useState(""),
    [otherId, setOtherId] = useState("");
  const [details, setDetails] = useState<Details | null>(null),
    [otherDetails, setOtherDetails] = useState<Details | null>(null);
  const [tab, setTab] = useState<Tab>("Scenes"),
    [index, setIndex] = useState(0),
    [catalog, setCatalog] = useState(false);
  const [sort, setSort] = useState("configuration");
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [sourceTarget, setSourceTarget] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const folderInput = useRef<HTMLInputElement>(null);
  const available = runs;
  const run = available.find((r) => r.id === selected) || available[0];
  const other = available.find(
    (r) => r.id === otherId && r.video === run?.video && r.id !== run?.id,
  );

  useEffect(() => {
    try {
      setUnlocked(sessionStorage.getItem("oe-unlocked") === "yes");
    } catch {}
    const q = new URLSearchParams(location.search);
    if (tabs.includes(q.get("tab") as Tab)) setTab(q.get("tab") as Tab);
    if (Number(q.get("window")) > 0) setIndex(Number(q.get("window")) - 1);
  }, []);
  useEffect(() => {
    if (!unlocked || !run) {
      setDetails(null);
      setOtherDetails(null);
      return;
    }
    let active = true;
    setLoading(true);
    setDetails(null);
    setOtherDetails(null);
    Promise.all([
      loadDetails(run),
      other ? loadDetails(other) : Promise.resolve(null),
    ])
      .then(([d, o]) => {
        if (active) {
          setDetails(d);
          setOtherDetails(o);
          setIndex((i) => Math.min(i, Math.max(0, d.windows.length - 1)));
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [run?.id, other?.id, unlocked]);
  useEffect(() => {
    if (!unlocked || !run) return;
    const q = new URLSearchParams(location.search);
    q.set("tab", tab);
    q.set("window", String(index + 1));
    if (run.manifest.run_id) q.set("run", run.manifest.run_id);
    else q.delete("run");
    q.set("video", run.video);
    if (other?.manifest.run_id) q.set("compare", other.manifest.run_id);
    else q.delete("compare");
    history.replaceState(null, "", `${location.pathname}?${q}`);
  }, [tab, index, unlocked, run?.id, other?.id]);

  async function onImport(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const id = crypto.randomUUID();
      const incoming = await importFiles(files, id);
      const accepted: Run[] = [];
      const replaced = new Set<string>();
      for (const r of incoming) {
        const duplicates = runs.filter(
          (old) =>
            r.manifest.run_id &&
            old.manifest.run_id === r.manifest.run_id &&
            old.video === r.video,
        );
        if (
          duplicates.length &&
          !window.confirm(
            `Run ${r.manifest.run_id} (${r.video}) is already imported. Replace its artifacts? Cancel skips this run.`,
          )
        )
          continue;
        duplicates.forEach((d) => replaced.add(d.id));
        accepted.push(r);
      }
      const next = [...runs.filter((r) => !replaced.has(r.id)), ...accepted];
      setRuns(next);
      if (accepted.length) {
        const q = new URLSearchParams(location.search);
        const match = next.find(
          (r) =>
            r.manifest.run_id === q.get("run") && r.video === q.get("video"),
        );
        setSelected((match || accepted[0]).id);
        if (match && Number(q.get("window")) > 0)
          setIndex(Number(q.get("window")) - 1);
        const compare = next.find(
          (r) =>
            r.manifest.run_id === q.get("compare") &&
            r.video === (match || accepted[0]).video &&
            r.id !== (match || accepted[0]).id,
        );
        setOtherId(compare?.id || "");
        setNotice(
          `Imported ${accepted.length} run/video ${accepted.length === 1 ? "entry" : "entries"}. Reimport to refresh the results.`,
        );
      }
      setCatalog(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (folderInput.current) folderInput.current.value = "";
    }
  }
  const currentWindow = details?.windows[index];
  const compareWindow =
    currentWindow &&
    otherDetails?.windows.find(
      (w) => w.start < currentWindow.end && w.end > currentWindow.start,
    );
  const selectRun = (id: string) => {
    setSelected(id);
    setOtherId("");
    setIndex(0);
    setCatalog(false);
  };

  if (!unlocked)
    return (
      <main className="lock-page">
        <div className="lock-brand">
          Open<span>Enricher</span>
          <span className="product-tag">EXPLORER</span>
        </div>
        <form
          className="lock-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (password === "1234") {
              setUnlocked(true);
              setPassword("");
              try {
                sessionStorage.setItem("oe-unlocked", "yes");
              } catch {}
            } else setPasswordError(true);
          }}
        >
          <div className="lock-symbol">
            <LockKeyhole size={23} />
          </div>
          <p className="eyebrow">EXPERIMENT WORKSPACE</p>
          <h1>
            A closer look at
            <br />
            your pipeline.
          </h1>
          <p className="muted">
            Explore scene metadata, compare experiments,
            <br />
            and understand the work behind each result.
          </p>
          <label htmlFor="password">Workspace password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            placeholder="Enter password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError(false);
            }}
          />
          {passwordError && (
            <p className="error" role="alert">
              Incorrect password. Try again.
            </p>
          )}
          <button className="primary" type="submit">
            Open workspace <ArrowRight size={16} />
          </button>
          <p className="gate-note">
            Enter your workspace password to continue.
          </p>
        </form>
        <span className="lock-footer">OPENENRICHER / EXPERIMENT EXPLORER</span>
      </main>
    );

  return (
    <div className="app-shell">
      <aside className="rail">
        <button
          title="Experiment catalog"
          className={catalog || !run ? "active" : ""}
          onClick={() => setCatalog(true)}
        >
          <FolderOpen size={21} />
        </button>
        <button
          title="Scene explorer"
          disabled={!run}
          className={!catalog && tab === "Scenes" ? "active" : ""}
          onClick={() => {
            setCatalog(false);
            setTab("Scenes");
          }}
        >
          <Film size={21} />
        </button>
        <button
          title="Performance"
          disabled={!run}
          className={!catalog && tab === "Performance" ? "active" : ""}
          onClick={() => {
            setCatalog(false);
            setTab("Performance");
          }}
        >
          <Activity size={21} />
        </button>
        <button
          title="Pipeline"
          disabled={!run}
          className={!catalog && tab === "Pipeline" ? "active" : ""}
          onClick={() => {
            setCatalog(false);
            setTab("Pipeline");
          }}
        >
          <GitBranch size={21} />
        </button>
        <div className="rail-bottom">
          <button
            title="Lock workspace"
            onClick={() => {
              setUnlocked(false);
              try {
                sessionStorage.removeItem("oe-unlocked");
              } catch {}
            }}
          >
            <LockKeyhole size={19} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="wordmark" onClick={() => setCatalog(true)}>
            Open<span>Enricher</span>
            <span className="product-tag">EXPLORER</span>
          </button>
          <div className="top-actions">
            <button
              className="primary small"
              disabled={busy}
              onClick={() => folderInput.current?.click()}
            >
              <Upload size={15} />
              {busy ? "Importing…" : "Import folder"}
            </button>
          </div>
        </header>
        <input
          hidden
          type="file"
          multiple
          ref={folderInput}
          {...({
            webkitdirectory: "",
            directory: "",
          } as React.InputHTMLAttributes<HTMLInputElement>)}
          onChange={(e) => void onImport(Array.from(e.target.files || []))}
        />
        {error && (
          <div className="banner danger" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="banner success" role="status">
            <Check size={16} />
            {notice}
            <button onClick={() => setNotice("")} aria-label="Dismiss message">
              <X size={16} />
            </button>
          </div>
        )}
        {catalog || !run ? (
          <main className="catalog">
            <div className="page-heading">
              <div>
                <p className="eyebrow">YOUR WORKSPACE</p>
                <h1>Experiments</h1>
                <p className="muted">
                  Every execution, its evidence, and the details that make a
                  difference.
                </p>
              </div>
              <span className="count-chip">
                {available.length} run/video entries
              </span>
            </div>
            <div className="import-zone">
              <div className="import-icon">
                <FolderOpen size={26} />
              </div>
              <div>
                <h3>Bring your pipeline results</h3>
                <p>
                  Select a parent folder containing run archives, reference
                  synopses and the frame cache.
                </p>
              </div>
              <button onClick={() => folderInput.current?.click()}>
                Choose folder <ArrowRight size={15} />
              </button>
            </div>
            <div className="table-tools">
              <label className="search">
                <Search size={16} />
                <input
                  aria-label="Search experiments"
                  placeholder="Search runs, configurations or videos…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label className="filter">
                <select
                  aria-label="Sort experiments"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="configuration">Sort: configuration</option>
                  <option value="run">Sort: run identity</option>
                  <option value="score">Sort: valid score</option>
                </select>
                <ListFilter size={15} />
                <select
                  aria-label="Filter evaluation"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All evaluations</option>
                  <option value="valid">Evaluated</option>
                  <option value="failed">Evaluation failed</option>
                  <option value="missing">Not evaluated</option>
                </select>
              </label>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Experiment / run</th>
                    <th>Video</th>
                    <th>Execution</th>
                    <th>Evaluation</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...available]
                    .sort((a, b) =>
                      sort === "score"
                        ? (evaluationState(b.score) === "valid"
                            ? b.score!.overall
                            : -1) -
                          (evaluationState(a.score) === "valid"
                            ? a.score!.overall
                            : -1)
                        : String(
                            sort === "run" ? a.label : a.config.experiment_id,
                          ).localeCompare(
                            String(
                              sort === "run" ? b.label : b.config.experiment_id,
                            ),
                          ),
                    )
                    .filter(
                      (r) =>
                        `${r.label} ${r.video} ${r.config.experiment_id}`
                          .toLowerCase()
                          .includes(search.toLowerCase()) &&
                        (filter === "all" ||
                          evaluationState(r.score) === filter),
                    )
                    .map((r) => (
                      <tr key={r.id}>
                        <td>
                          <button
                            className="run-link"
                            onClick={() => selectRun(r.id)}
                          >
                            {r.config.title || r.config.experiment_id}
                            <ArrowRight size={14} />
                          </button>
                          <span className="mono muted">{r.label}</span>
                          {!r.manifest.run_id && (
                            <span className="legacy">
                              Local identity · {r.importId.slice(0, 8)}
                            </span>
                          )}
                        </td>
                        <td>
                          <Film size={14} /> {r.video}
                        </td>
                        <td>
                          <Badge
                            tone={r.result.status === "success" ? "green" : ""}
                          >
                            {r.result.status || "Status unavailable"}
                          </Badge>
                          {r.manifest.started_at && (
                            <span className="muted date">
                              {r.manifest.started_at}
                            </span>
                          )}
                        </td>
                        <td>
                          <EvaluationBadge score={r.score} />
                        </td>
                        <td>
                          <button
                            className="icon-btn"
                            title="Open run"
                            onClick={() => selectRun(r.id)}
                          >
                            <ChevronRight size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="catalog-footer">
              <span>
                {available.length
                  ? "Select an execution to explore its results."
                  : "No experiments imported yet. Choose a folder to get started."}
              </span>
              {!!runs.length && (
                <button
                  onClick={() => {
                    if (
                      confirm("Remove all imported files from this workspace?")
                    ) {
                      setRuns([]);
                      setSelected("");
                      setOtherId("");
                    }
                  }}
                >
                  Clear all imports
                </button>
              )}
            </div>
            {!!runs.length && (
              <details className="imports-list">
                <summary>Manage imports</summary>
                {[...new Set(runs.map((r) => r.importId))].map((id) => (
                  <div key={id}>
                    <span>
                      {
                        runs
                          .find((r) => r.importId === id)
                          ?.folder.split("/")[0]
                      }{" "}
                      · {id.slice(0, 8)} ·{" "}
                      {runs.filter((r) => r.importId === id).length} entries
                    </span>
                    <button
                      onClick={() => {
                        setRuns((rs) => rs.filter((r) => r.importId !== id));
                        setOtherId("");
                      }}
                    >
                      Remove import
                    </button>
                  </div>
                ))}
              </details>
            )}
          </main>
        ) : (
          <>
            <section className="run-header">
              <div className="breadcrumb">
                <button onClick={() => setCatalog(true)}>Experiments</button>
                <ChevronRight size={12} />
                <span>{run.config.experiment_id}</span>
                <ChevronRight size={12} />
                <span>{run.video}</span>
              </div>
              <div className="heading-row">
                <div>
                  <div className="title-line">
                    <h1>
                      {run.video
                        .replaceAll("_", " ")
                        .replace(/\.(mkv|mp4|mov)$/i, "")}
                    </h1>
                    <Badge
                      tone={run.result.status === "success" ? "green" : ""}
                    >
                      {run.result.status || "Imported"}
                    </Badge>
                  </div>
                  <div className="run-meta">
                    <span className="mono">{run.label}</span>
                    <span>·</span>
                    <span>{run.config.title || run.config.experiment_id}</span>
                    <span>·</span>
                    <span>{run.config.interval_seconds || "—"}s windows</span>
                    {run.manifest.source_commit && (
                      <>
                        <span>·</span>
                        <span
                          className="mono"
                          title={run.manifest.source_commit}
                        >
                          {run.manifest.source_commit.slice(0, 8)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="run-controls">
                  <label className="select-wrap">
                    <Layers3 size={15} />
                    <select
                      aria-label="Selected run"
                      value={run.id}
                      onChange={(e) => selectRun(e.target.value)}
                    >
                      {available.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label} · {r.video}
                          {!r.manifest.run_id
                            ? ` · ${r.importId.slice(0, 6)}`
                            : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={13} />
                  </label>
                  <label
                    className={`compare-select ${other ? "selected" : ""}`}
                  >
                    <Columns2 size={16} />
                    <select
                      aria-label="Compare with another run"
                      value={other?.id || ""}
                      onChange={(e) => setOtherId(e.target.value)}
                    >
                      <option value="">Compare run</option>
                      {available
                        .filter((r) => r.id !== run.id && r.video === run.video)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                            {!r.manifest.run_id
                              ? ` · ${r.importId.slice(0, 6)}`
                              : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="icon-btn bordered"
                    title="Inspect original files"
                    onClick={() => {
                      setSourceTarget(run.id);
                      setSourceOpen(true);
                    }}
                  >
                    <Braces size={18} />
                  </button>
                </div>
              </div>
              <nav className="tabs">
                {tabs.map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t === "Scenes" ? (
                      <Film size={15} />
                    ) : t === "Performance" ? (
                      <Activity size={15} />
                    ) : t === "Pipeline" ? (
                      <GitBranch size={15} />
                    ) : (
                      <Layers3 size={15} />
                    )}
                    {t}
                    {t === "Scenes" && (
                      <span>{details?.windows.length ?? "—"}</span>
                    )}
                  </button>
                ))}
              </nav>
            </section>
            {other && (
              <div className="comparison-banner">
                <Columns2 size={16} />
                <strong>Comparing</strong>
                <span className="mono">{run.label}</span>
                <ArrowLeft size={13} />
                <ArrowRight size={13} />
                <span className="mono">{other.label}</span>
                <span className="muted">
                  Same video · shared window navigation
                  {run.config.experiment_id === other.config.experiment_id
                    ? " · same configuration"
                    : ""}
                </span>
                <button
                  onClick={() => setOtherId("")}
                  aria-label="Stop comparing"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {loading || !details ? (
              <div className="loading">Reading artifacts…</div>
            ) : (
              <>
                {other && otherDetails && (
                  <ComparisonSummary
                    run={run}
                    other={other}
                    a={details}
                    b={otherDetails}
                  />
                )}
                {!!details.warnings.length && (
                  <details className="warnings">
                    <summary>
                      {details.warnings.length} import/provenance{" "}
                      {details.warnings.length === 1 ? "notice" : "notices"}
                    </summary>
                    {details.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </details>
                )}
                {tab === "Scenes" && (
                  <div className="scene-layout">
                    <aside className="window-index">
                      <div className="index-title">
                        <span>SCENE WINDOWS</span>
                        <span>{details.windows.length}</span>
                      </div>
                      <div className="window-list">
                        {details.windows.map((w, i) => (
                          <button
                            key={i}
                            onClick={() => setIndex(i)}
                            className={index === i ? "active" : ""}
                          >
                            <span className="window-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <strong>{clock(w.start)}</strong>
                              <small>{clock(w.end)}</small>
                            </div>
                            <span className="window-dot" />
                          </button>
                        ))}
                      </div>
                      <div className="index-note">
                        <Info size={14} />
                        <p>
                          Fixed analysis windows,
                          <br />
                          not detected scene cuts.
                        </p>
                      </div>
                    </aside>
                    <main className="scene-main">
                      {currentWindow ? (
                        <>
                          <div className="scene-toolbar">
                            <div>
                              <h2>
                                Scene {String(index + 1).padStart(2, "0")}
                              </h2>
                              <span className="time-pill">
                                <Clock3 size={13} />
                                {clock(currentWindow.start)} –{" "}
                                {clock(currentWindow.end)}
                              </span>
                            </div>
                            <div className="scene-arrows">
                              <button
                                disabled={index === 0}
                                onClick={() => setIndex((i) => i - 1)}
                                aria-label="Previous window"
                              >
                                <ChevronLeft size={17} />
                              </button>
                              <span>
                                {index + 1} / {details.windows.length}
                              </span>
                              <button
                                disabled={index >= details.windows.length - 1}
                                onClick={() => setIndex((i) => i + 1)}
                                aria-label="Next window"
                              >
                                <ChevronRight size={17} />
                              </button>
                            </div>
                          </div>
                          <div className={other ? "comparison-scenes" : ""}>
                            <div>
                              {other && (
                                <div className="column-label">
                                  A <span>{run.label}</span>
                                </div>
                              )}
                              <ScenePanel
                                run={run}
                                details={details}
                                window={currentWindow}
                                onSource={() => {
                                  setSourceTarget(run.id);
                                  setSourceOpen(true);
                                }}
                              />
                            </div>
                            {other && otherDetails && (
                              <div>
                                <div className="column-label">
                                  B <span>{other.label}</span>
                                </div>
                                {compareWindow ? (
                                  <>
                                    <p className="alignment-note">
                                      {clock(compareWindow.start)} –{" "}
                                      {clock(compareWindow.end)}
                                      {(compareWindow.start !==
                                        currentWindow.start ||
                                        compareWindow.end !==
                                          currentWindow.end) &&
                                        " · Overlapping window; boundaries differ"}
                                    </p>
                                    <ScenePanel
                                      run={other}
                                      details={otherDetails}
                                      window={compareWindow}
                                      onSource={() => {
                                        setSourceTarget(other.id);
                                        setSourceOpen(true);
                                      }}
                                    />
                                  </>
                                ) : (
                                  <Empty title="No overlapping window">
                                    This run has no window in the selected
                                    interval.
                                  </Empty>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <Empty title="Scene timeline unavailable">
                          Import dialogue or VLM artifacts with valid window
                          boundaries. Other tabs and original files remain
                          available.
                        </Empty>
                      )}
                    </main>
                  </div>
                )}
                {tab === "Overview" && (
                  <main
                    className={`content-page ${other ? "overview-compare" : ""}`}
                  >
                    <div>
                      {other && (
                        <div className="column-label">
                          A <span>{run.label}</span>
                        </div>
                      )}
                      <Overview run={run} details={details} />
                    </div>
                    {other && otherDetails && (
                      <div>
                        <div className="column-label">
                          B <span>{other.label}</span>
                        </div>
                        <Overview
                          run={other}
                          details={otherDetails}
                          baseline={run}
                        />
                      </div>
                    )}
                  </main>
                )}
                {tab === "Performance" && (
                  <main className="content-page">
                    <Performance
                      run={run}
                      details={details}
                      other={other}
                      otherDetails={otherDetails}
                      onWindow={(i) => {
                        setIndex(i);
                        setTab("Scenes");
                      }}
                    />
                  </main>
                )}
                {tab === "Pipeline" && (
                  <main className="content-page">
                    <Pipeline run={run} details={details} />
                    {other && otherDetails && (
                      <>
                        <div className="section-heading">
                          <h2>Comparison pipeline · {other.label}</h2>
                        </div>
                        <Pipeline run={other} details={otherDetails} />
                      </>
                    )}
                  </main>
                )}
              </>
            )}
          </>
        )}
        <div className="inspection-note">
          Browser local inspection · No data upload
        </div>
      </div>
      {sourceOpen && run && (
        <SourceDrawer
          run={other && sourceTarget === other.id ? other : run}
          sources={
            (other && sourceTarget === other.id
              ? otherDetails?.sources
              : details?.sources) || []
          }
          onClose={() => setSourceOpen(false)}
        />
      )}
    </div>
  );
}

function ScenePanel({
  run,
  details,
  window: w,
  onSource,
}: {
  run: Run;
  details: Details;
  window: WindowData;
  onSource: () => void;
}) {
  const [sample, setSample] = useState(0),
    [time, setTime] = useState(w.start),
    [query, setQuery] = useState(""),
    [speaker, setSpeaker] = useState("all"),
    [overlay, setOverlay] = useState(false),
    [enlarged, setEnlarged] = useState(false);
  const [url, setUrl] = useState(""),
    [imageError, setImageError] = useState(false);
  useEffect(() => {
    if (!enlarged) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEnlarged(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [enlarged]);
  const frame = w.frames[sample];
  useEffect(() => {
    setSample(0);
    setTime(w.start);
    setQuery("");
    setSpeaker("all");
  }, [w.start, run.id]);
  useEffect(() => {
    setImageError(false);
    const source = frame?.file ? findFrame(run, frame.file) : undefined;
    const next = source ? URL.createObjectURL(source.file) : "";
    setUrl(next);
    return () => {
      if (next) URL.revokeObjectURL(next);
    };
  }, [run.id, frame]);
  const lines = transcriptFor(details.audio, w.start, w.end);
  const shown = lines.filter(
    (l) =>
      (speaker === "all" || l.speaker === speaker) &&
      String(l.text || "")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const activeLines = lines.filter(
    (l) =>
      seconds(l.start_timestamp) <= time && seconds(l.end_timestamp) > time,
  );
  function chooseFrame(i: number) {
    setSample(i);
    const t = Number(w.frames[i]?.timestamp_seconds);
    if (Number.isFinite(t)) setTime(t);
  }
  function chooseTime(t: number) {
    setTime(t);
    const timedFrames = w.frames
      .map((frame, index) => ({ frame, index }))
      .filter(({ frame }) => Number.isFinite(frame.timestamp_seconds));
    if (timedFrames.length) {
      const nearest = timedFrames.reduce(
        (best, f, i) =>
          Math.abs(f.frame.timestamp_seconds - t) <
          Math.abs(timedFrames[best].frame.timestamp_seconds - t)
            ? i
            : best,
        0,
      );
      setSample(timedFrames[nearest].index);
    }
  }
  return (
    <div className="scene-panel">
      <div className="evidence-column">
        <section className="frame-card">
          <div className="panel-heading">
            <h3>
              <ImageIcon size={15} /> Visual evidence
            </h3>
            <span>
              {w.frames.length
                ? `${w.frames.length} samples`
                : "Frames unavailable"}
            </span>
          </div>
          <button
            className="hero-frame"
            onClick={() => {
              if (url && !imageError) setEnlarged(true);
            }}
            aria-label={url ? "Enlarge selected frame" : "Frame unavailable"}
          >
            <div className="frame-corner top-left" />
            <div className="frame-corner bottom-right" />
            {url && !imageError ? (
              <img
                src={url}
                alt={`Sample ${sample + 1}, video time ${clock(Number(frame?.timestamp_seconds))}`}
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="placeholder-content">
                <div className="placeholder-icon">
                  <Film size={31} strokeWidth={1.25} />
                </div>
                <strong>
                  {w.frameError ? "Frame capture failed" : "Frame unavailable"}
                </strong>
                <span>
                  {frame
                    ? "Image file missing from this import"
                    : "No frame files were provided for this window"}
                </span>
              </div>
            )}
            <span className="frame-label">
              {frame
                ? `SAMPLE ${String(sample + 1).padStart(2, "0")}`
                : "NO FRAME"}
            </span>
            <span className="frame-time">
              {frame && Number.isFinite(Number(frame.timestamp_seconds))
                ? clock(Number(frame.timestamp_seconds))
                : "—:—:—"}
            </span>
            {overlay &&
              Number.isFinite(frame?.timestamp_seconds) &&
              !!activeLines.length && (
                <span className="subtitle">
                  {activeLines
                    .map((l) => `${l.speaker || "UNKNOWN"}: ${l.text}`)
                    .join("\n")}
                </span>
              )}
          </button>
          <div className="frame-filmstrip">
            {w.frames.map((f: Doc, i) => (
              <button
                key={i}
                className={sample === i ? "active" : ""}
                onClick={() => chooseFrame(i)}
                aria-label={`Select frame ${i + 1}`}
              >
                <FrameThumb run={run} frame={w.frames[i]} />
                <span>
                  {f.timestamp_seconds !== undefined
                    ? clock(Number(f.timestamp_seconds))
                    : String(i + 1).padStart(2, "0")}
                </span>
              </button>
            ))}
          </div>
          <div className="frame-bottom">
            <span>
              {Number.isFinite(frame?.timestamp_seconds) ? (
                <>Sample time · {clock(Number(frame.timestamp_seconds))}</>
              ) : (
                "No sample timestamps available"
              )}
            </span>
            <label>
              <input
                type="checkbox"
                disabled={!Number.isFinite(frame?.timestamp_seconds)}
                checked={overlay}
                onChange={(e) => setOverlay(e.target.checked)}
              />{" "}
              Dialogue overlay
            </label>
          </div>
          {w.frameError && <p className="inline-warning">{w.frameError}</p>}
          {frame?.recovered && (
            <p className="inline-warning">
              Frames added after execution. Sample timestamps are unavailable;
              dialogue synchronization is disabled.
            </p>
          )}
          {frame?.file && <p className="frame-path mono">{frame.file}</p>}
        </section>
        <section className="transcript-card">
          <div className="panel-heading">
            <h3>
              <Braces size={15} /> Dialogue transcript{" "}
              <span className="mini-count">{lines.length}</span>
            </h3>
            <Badge>Diarized speakers</Badge>
          </div>
          <div className="transcript-tools">
            <label className="search">
              <Search size={14} />
              <input
                placeholder="Search dialogue…"
                aria-label="Search dialogue"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter speaker"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
            >
              <option value="all">All speakers</option>
              {[...new Set(lines.map((l) => l.speaker || "UNKNOWN"))].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </div>
          {Number.isFinite(frame?.timestamp_seconds) && (
            <p className="inspection-time">
              Inspection time {clock(time)} · nearest sampled frame{" "}
              {clock(Number(frame.timestamp_seconds))}
            </p>
          )}
          <div className="transcript-lines">
            {shown.length ? (
              shown.map((line, i) => (
                <button
                  key={i}
                  className={
                    seconds(line.start_timestamp) <= time &&
                    seconds(line.end_timestamp) > time
                      ? "active"
                      : ""
                  }
                  onClick={() => chooseTime(seconds(line.start_timestamp))}
                >
                  <span className="line-time">
                    {clock(seconds(line.start_timestamp))}
                  </span>
                  <div>
                    <span
                      className={`speaker speaker-${String(line.speaker).slice(-1)}`}
                    >
                      {line.speaker || "UNKNOWN"}
                    </span>
                    <p>{line.text}</p>
                  </div>
                </button>
              ))
            ) : (
              <Empty
                title={
                  lines.length
                    ? "No matching dialogue"
                    : "No transcript in this window"
                }
              >
                Original speaker labels are retained; character identities are
                not inferred.
              </Empty>
            )}
          </div>
          <div className="panel-footnote">
            Speaker IDs are model labels, not verified character identities.
          </div>
        </section>
      </div>
      <aside className="metadata-column">
        <section className="metadata-card">
          <div className="panel-heading">
            <h3>
              <Layers3 size={15} /> Extracted metadata
            </h3>
            <Badge>VLM</Badge>
          </div>
          <TextField label="Scene description" value={w.visual.description} />
          <section className="text-field">
            <h4>Subjects & objects</h4>
            <Tags values={w.visual.subjects_and_objects} />
          </section>
          <section className="text-field">
            <h4>Actions</h4>
            <Tags values={w.visual.actions} />
          </section>
          <TextField label="Camera & shot" value={w.visual.camera_and_shot} />
          <TextField
            label="Lighting & color"
            value={w.visual.lighting_and_color}
          />
          <section className="text-field">
            <h4>On-screen text</h4>
            <Tags values={w.visual.on_screen_text} />
          </section>
          <button className="source-link" onClick={onSource}>
            <Braces size={14} /> Inspect original artifacts{" "}
            <ArrowRight size={13} />
          </button>
        </section>
        <section className="summary-card">
          <div className="panel-heading">
            <h3>Dialogue summary</h3>
            <Badge>LLM</Badge>
          </div>
          <p>
            {w.dialogue.description ||
              w.visual.dialogue_description ||
              "No generated dialogue summary available."}
          </p>
          {w.dialogue.dialogue_sampled && (
            <Badge tone="amber">Sampled dialogue input</Badge>
          )}
        </section>
      </aside>
      {enlarged && (
        <div
          className="image-modal"
          onClick={() => setEnlarged(false)}
          role="dialog"
          aria-label="Enlarged sample"
          aria-modal="true"
        >
          <button
            autoFocus
            className="modal-close"
            onClick={() => setEnlarged(false)}
            aria-label="Close enlarged frame"
          >
            <X />
          </button>
          <img
            src={url}
            alt={`Sample at ${clock(Number(frame?.timestamp_seconds))}`}
          />
          <p>
            {clock(Number(frame?.timestamp_seconds))} · {frame?.file}
          </p>
        </div>
      )}
    </div>
  );
}
function FrameThumb({ run, frame }: { run: Run; frame?: Doc }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const f = frame?.file ? findFrame(run, frame.file) : undefined;
    const u = f ? URL.createObjectURL(f.file) : "";
    setUrl(u);
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [run.id, frame]);
  return url ? (
    <img src={url} alt="" />
  ) : (
    <ImageIcon size={17} strokeWidth={1.25} />
  );
}

function Overview({
  run,
  details: d,
  baseline,
}: {
  run: Run;
  details: Details;
  baseline?: Run;
}) {
  const p = d.profile,
    state = evaluationState(run.score);
  const delta =
    baseline && evaluationState(baseline.score) === "valid" && state === "valid"
      ? run.score!.overall - baseline.score!.overall
      : null;
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">WHOLE-VIDEO OUTPUT</p>
          <h2>Beyond individual scenes</h2>
        </div>
        <EvaluationBadge score={run.score} />
      </div>
      <section className="overview-card">
        <p className="eyebrow">NARRATIVE HOOK</p>
        <h2 className="narrative">
          {p.content_summary?.narrative_hook || "Narrative hook not provided"}
        </h2>
        <TextField
          label="Visual style"
          value={p.content_summary?.visual_style}
        />
        <div className="profile-grid">
          {[
            ["Primary genre", p.recsys_metadata?.primary_genre],
            ["Pacing", p.recsys_metadata?.pacing],
            ["Target audience", p.audience_profiling?.target_age_group],
          ].map(([label, value]) => (
            <div key={label}>
              <h4>{label}</h4>
              <p>{value || "Not provided"}</p>
            </div>
          ))}
        </div>
        {[
          ["Subgenres", p.recsys_metadata?.sub_genres],
          ["Mood", p.recsys_metadata?.mood],
          ["Semantic tags", p.search_and_discovery?.semantic_tags],
          ["Topics", p.search_and_discovery?.main_topics],
          ["Viewer interests", p.audience_profiling?.viewer_interests],
        ].map(([label, values]) => (
          <section className="text-field" key={String(label)}>
            <h4>{label}</h4>
            <Tags values={values} />
          </section>
        ))}
      </section>
      <div className="summary-grid">
        <section className="overview-card">
          <p className="eyebrow">GENERATED OUTPUT</p>
          <h3>Plot summary</h3>
          <p className="long-text">
            {d.dialogue.plot_summary || "No generated plot summary available."}
          </p>
        </section>
        <section className="overview-card">
          <p className="eyebrow">REFERENCE MATERIAL</p>
          <h3>Synopsis</h3>
          <p className="long-text">
            {d.synopsis ||
              "No synopsis imported. Include synopsis/<video>_summary.txt with the archive."}
          </p>
        </section>
      </div>
      <section className="overview-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EXTERNAL AGENT</p>
            <h2>Metadata evaluation</h2>
          </div>
          {state === "valid" && (
            <div className="big-score">
              {run.score!.overall.toFixed(2)}
              <span>/ 5</span>
              {delta !== null && (
                <small>
                  Δ {delta >= 0 ? "+" : ""}
                  {delta.toFixed(2)} vs A
                </small>
              )}
            </div>
          )}
        </div>
        {state === "missing" ? (
          <Empty title="Not evaluated">
            Import score.json to inspect quality dimensions and evaluator
            rationale.
          </Empty>
        ) : state === "failed" ? (
          <div className="evaluation-error">
            <Badge tone="amber">Evaluation failed</Badge>
            <p>
              {run.score!.error ||
                "The evaluator report is invalid or has parsing errors."}
            </p>
            <p>Fallback scores are excluded from quality comparisons.</p>
          </div>
        ) : (
          <>
            <div className="evaluation-method">
              <Badge tone={run.score!.usable ? "green" : "amber"}>
                {run.score!.usable ? "Usable" : "Below usability threshold"}
              </Badge>
              <span>
                {run.score!.method?.provider || "Provider unknown"} /{" "}
                {run.score!.method?.model || "Model unknown"}
              </span>
              <span>
                Reference:{" "}
                {run.score!.method?.uses_synopsis
                  ? "synopsis"
                  : "title / model knowledge"}
              </span>
            </div>
            <p className="evaluation-summary">{run.score!.summary}</p>
            {Object.entries(run.score!.dimensions || {}).map(
              ([name, value]) => {
                const v = value as Doc;
                const base = baseline?.score?.dimensions?.[name]?.score;
                const difference =
                  Number.isFinite(base) &&
                  evaluationState(baseline?.score || null) === "valid"
                    ? Number(v.score) - Number(base)
                    : null;
                return (
                  <div className="dimension" key={name}>
                    <div>
                      <strong>{name.replaceAll("_", " ")}</strong>
                      <span>
                        {v.score} / 5{" "}
                        {difference !== null && (
                          <small>
                            Δ {difference >= 0 ? "+" : ""}
                            {difference} ·{" "}
                          </small>
                        )}
                        <small>· weight {Math.round(v.weight * 100)}%</small>
                      </span>
                    </div>
                    <div className="dimension-track">
                      <i
                        style={{
                          width: `${Math.max(0, Math.min(100, (Number(v.score) / 5) * 100))}%`,
                        }}
                      />
                    </div>
                    <p>{v.note}</p>
                  </div>
                );
              },
            )}
            <p className="panel-footnote">
              Usable when overall ≥{" "}
              {run.score!.thresholds?.usable_overall_min ?? "—"} and fidelity ≥{" "}
              {run.score!.thresholds?.usable_fidelity_min ?? "—"}. Evaluator
              judgments may be incorrect; inspect the evidence.
            </p>
          </>
        )}
      </section>
    </>
  );
}
function Performance({
  run,
  details: d,
  other,
  otherDetails,
  onWindow,
}: {
  run: Run;
  details: Details;
  other?: Run;
  otherDetails: Details | null;
  onWindow: (i: number) => void;
}) {
  const [expanded, setExpanded] = useState<string[]>(["vlm"]);
  const stages: Doc[] = Array.isArray(d.timings.stages) ? d.timings.stages : [];
  const reference: Doc[] = otherDetails?.timings.stages || [];
  const validDuration = (s: Doc) =>
    Number.isFinite(s.wall_seconds) && s.wall_seconds >= 0;
  const max = Math.max(
    1,
    ...stages.filter(validDuration).map((s) => s.wall_seconds),
    ...reference.filter(validDuration).map((s) => s.wall_seconds),
  );
  const executed = stages
    .filter((s) => !isCached(run, s.stage) && validDuration(s))
    .reduce((sum, s) => sum + s.wall_seconds, 0);
  const cached = stages
    .filter((s) => isCached(run, s.stage) && validDuration(s))
    .reduce((sum, s) => sum + s.wall_seconds, 0);
  function category(name: string) {
    if (/load/.test(name)) return "load";
    if (/align/.test(name)) return "align";
    if (/diariz/.test(name)) return "diarize";
    return "generate";
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">PROCESSING COST</p>
          <h2>Where the time goes</h2>
          <p className="muted">
            Measured durations by stage and phase. Bars share an axis starting
            at zero.
          </p>
        </div>
        <Badge>Duration breakdown</Badge>
      </div>
      <div className="performance-stats">
        <div>
          <span>Executed stage wall durations</span>
          <strong>{stages.length ? duration(executed) : "—"}</strong>
          <small>Sum of recorded stages · excludes reused work</small>
        </div>
        <div>
          <span>Original cached computation</span>
          <strong>{duration(cached)}</strong>
          <small>Artifact reference · not executed in this run</small>
        </div>
        <div>
          <span>Recorded stages</span>
          <strong>{stages.length.toString().padStart(2, "0")}</strong>
          <small>Run elapsed and evaluation time not inferred</small>
        </div>
      </div>
      <div className="trace-note">
        <Info size={16} />
        <p>
          Current timing files record durations without start offsets. This view
          does not imply exact execution order or concurrency. VLM window
          processing may include preparation and frame capture.
        </p>
      </div>
      <div className="legend">
        <span>
          <i className="load" />
          Model load
        </span>
        <span>
          <i className="generate" />
          Generation / processing
        </span>
        <span>
          <i className="align" />
          Alignment
        </span>
        <span>
          <i className="diarize" />
          Diarization
        </span>
      </div>
      {!stages.length ? (
        <Empty title="No timing artifacts available" />
      ) : (
        <section className="trace-card">
          <div className="trace-axis">
            <span>STAGE / PHASE</span>
            <div>
              <span>0s</span>
              <span>{duration(max / 2)}</span>
              <span>{duration(max)}</span>
            </div>
            <span>DURATION</span>
          </div>
          {stages.map((stage, si) => {
            const spans: Doc[] = Array.isArray(stage.spans) ? stage.spans : [];
            const sum = spans.reduce((a, s) => a + (Number(s.seconds) || 0), 0);
            const cachedStage = isCached(run, stage.stage);
            const ref = reference.find((s) => s.stage === stage.stage);
            const compatible =
              ref &&
              other &&
              !isCached(other, stage.stage) &&
              !cachedStage &&
              validDuration(ref) &&
              validDuration(stage);
            return (
              <div className="stage-trace" key={`${stage.stage}-${si}`}>
                <button
                  className="trace-row stage"
                  onClick={() =>
                    setExpanded((s) =>
                      s.includes(stage.stage)
                        ? s.filter((x) => x !== stage.stage)
                        : [...s, stage.stage],
                    )
                  }
                >
                  <span>
                    <ChevronDown
                      size={14}
                      className={
                        expanded.includes(stage.stage) ? "" : "collapsed"
                      }
                    />
                    <strong>{stageNames[stage.stage] || stage.stage}</strong>
                  </span>
                  <div className="bar-track">
                    <i
                      className={`bar stage-${stage.stage}`}
                      style={{
                        width: `${validDuration(stage) ? (stage.wall_seconds / max) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <strong>{duration(stage.wall_seconds)}</strong>
                </button>
                <div className="stage-caption">
                  {cachedStage
                    ? "Reused artifact — original timing"
                    : "A · recorded wall duration"}
                  {compatible && (
                    <span>
                      Δ {stage.wall_seconds - ref.wall_seconds >= 0 ? "+" : ""}
                      {duration(stage.wall_seconds - ref.wall_seconds)} vs B
                    </span>
                  )}
                </div>
                {ref && (
                  <div className="trace-row reference">
                    <span>B · {other!.label}</span>
                    <div className="bar-track">
                      <i
                        className="bar reference-bar"
                        style={{
                          width: `${validDuration(ref) ? (ref.wall_seconds / max) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <strong>{duration(ref.wall_seconds)}</strong>
                    <small>
                      {!compatible
                        ? "Cache / timing semantics may differ"
                        : "Compare instrumentation and hardware before interpreting differences"}
                    </small>
                  </div>
                )}
                {expanded.includes(stage.stage) && (
                  <div className="phase-rows">
                    {spans.map((span, i) => (
                      <div className="trace-row phase" key={i}>
                        <span title={span.name}>
                          <i
                            className={`phase-dot ${category(span.name || "")}`}
                          />
                          {span.name === "vlm_generate"
                            ? "Window processing"
                            : String(span.name || "Unnamed phase").replaceAll(
                                "_",
                                " ",
                              )}
                          {span.window && (
                            <button
                              className="window-jump"
                              disabled={!d.windows.length}
                              onClick={() =>
                                onWindow(
                                  Math.max(
                                    0,
                                    Math.min(
                                      d.windows.length - 1,
                                      Number(span.window) - 1,
                                    ),
                                  ),
                                )
                              }
                            >
                              #{span.window}
                            </button>
                          )}
                        </span>
                        <div className="bar-track">
                          <i
                            className={`bar ${category(span.name || "")}`}
                            style={{
                              width: `${(Math.max(0, Number(span.seconds) || 0) / max) * 100}%`,
                            }}
                          />
                        </div>
                        <span title={span.model_id}>
                          {duration(Number(span.seconds))}
                        </span>
                        {compatible &&
                          (() => {
                            const match = (ref.spans || []).find(
                              (v: Doc) =>
                                v.name === span.name &&
                                v.window === span.window &&
                                v.attempt === span.attempt,
                            );
                            return Number.isFinite(match?.seconds) ? (
                              <small>
                                B: {duration(match.seconds)} · Δ B − A:{" "}
                                {duration(match.seconds - Number(span.seconds))}
                              </small>
                            ) : null;
                          })()}
                        {(span.model_id || span.attempt) && (
                          <small>
                            {span.model_id || ""}
                            {span.attempt ? ` · attempt ${span.attempt}` : ""}
                          </small>
                        )}
                      </div>
                    ))}
                    <div className="timing-coverage">
                      Recorded phase sum: {duration(sum)} · stage wall:{" "}
                      {duration(stage.wall_seconds)}.{" "}
                      {sum > stage.wall_seconds
                        ? "Phase totals exceed wall duration; possible nesting or inconsistent instrumentation."
                        : "Gap positions and phase overlap are not recorded; no synthetic spans added."}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
function Pipeline({ run, details }: { run: Run; details: Details }) {
  const [selected, setSelected] = useState("vlm");
  const stages: Doc[] = run.result.stages?.length
    ? run.result.stages
    : (details.timings.stages || []).map((s: Doc) => ({
        stage: s.stage,
        status: "unknown",
      }));
  const known = ["audio", "dialogue", "vlm", "llm"];
  const selectedStage = stages.find((s) => s.stage === selected);
  const descriptions: Record<string, string> = {
    audio:
      "Transcription, alignment and speaker diarization produce timestamped dialogue.",
    dialogue:
      "A generated plot and per-window dialogue descriptions are derived from the transcript.",
    vlm: run.config.visual_only
      ? "Visual metadata is extracted from video windows and previous-window memory. Dialogue descriptions are not supplied to the VLM."
      : "Visual metadata is extracted from video windows, dialogue descriptions and previous-window metadata.",
    llm: "The generated plot and accumulated scene metadata are synthesized into a whole-video profile.",
    evaluation:
      "An external provider scores the final profile. Evaluation is a model judgment, not a ground-truth annotation.",
  };
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">EXTRACTION STRUCTURE</p>
          <h2>From video to metadata</h2>
          <p className="muted">
            Derived from the known pipeline implementation and archived
            configuration.
          </p>
        </div>
        <Badge>Configuration diagram</Badge>
      </div>
      <div className="pipeline-flags">
        <span>
          Window <strong>{run.config.interval_seconds || "—"} seconds</strong>
        </span>
        <span>
          VLM memory{" "}
          <strong>
            {run.config.vlm_memory_scenes == null
              ? "All previous windows"
              : `${run.config.vlm_memory_scenes} windows`}
          </strong>
        </span>
        <span>
          VLM dialogue input{" "}
          <strong>{run.config.visual_only ? "Disabled" : "Enabled"}</strong>
        </span>
      </div>
      <section className="pipeline-canvas" aria-label="Pipeline data flow">
        <div className="pipeline-diagram">
          <svg
            className="pipeline-edges"
            viewBox="0 0 1080 340"
            aria-hidden="true"
          >
            <defs>
              <marker
                id={`arrow-${run.id.replace(/[^a-z0-9]/gi, "")}`}
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0 0 L7 3.5 L0 7 Z" fill="currentColor" />
              </marker>
            </defs>
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd={`url(#arrow-${run.id.replace(/[^a-z0-9]/gi, "")})`}
            >
              <path d="M140 198 H185" />
              <path d="M325 198 H370" />
              <path
                d="M510 198 H555"
                className={run.config.visual_only ? "edge-muted" : ""}
              />
              <path d="M695 198 H740" />
              <path d="M880 198 H925" />
              <path d="M80 148 V45 H625 V148" className="edge-video" />
              <path d="M440 248 V290 H810 V248" className="edge-plot" />
              <path d="M695 169 H716 V103 H650 V148" className="edge-memory" />
            </g>
            <g className="edge-labels" textAnchor="middle">
              <text x="350" y="135">
                Transcript
              </text>
              <text x="533" y="135">
                {run.config.visual_only ? "Windows" : "Scene context"}
              </text>
              <text x="718" y="266">
                Visual metadata
              </text>
              <text x="905" y="135">
                Profile
              </text>
              <text x="350" y="33" className="label-video">
                Video windows
              </text>
              <text x="625" y="312" className="label-plot">
                Whole-video plot summary
              </text>
              <text x="686" y="88" className="label-memory">
                Previous-window memory
              </text>
            </g>
          </svg>
          <div className="diagram-video">
            <Film size={22} />
            <strong>Video</strong>
            <span title={run.video}>{run.video}</span>
          </div>
          {[...known, "evaluation"].map((name, i) => (
            <button
              key={name}
              style={{ left: 185 + i * 185 }}
              className={`pipeline-node diagram-node ${selected === name ? "active" : ""}`}
              aria-pressed={selected === name}
              onClick={() => setSelected(name)}
            >
              <span className="node-index">0{i + 1}</span>
              {name === "audio" ? (
                <Activity size={20} />
              ) : name === "evaluation" ? (
                <Check size={20} />
              ) : (
                <Layers3 size={20} />
              )}
              <strong>{stageNames[name] || "Evaluation"}</strong>
              <span>
                {name === "evaluation"
                  ? evaluationState(run.score)
                  : stages.find((s) => s.stage === name)?.status ||
                    "Not recorded"}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="overview-card node-detail">
        <div>
          <p className="eyebrow">SELECTED STAGE</p>
          <h2>{stageNames[selected] || "Evaluation"}</h2>
          <p>{descriptions[selected]}</p>
        </div>
        <div>
          <Badge tone={selectedStage?.status === "success" ? "green" : ""}>
            {selected === "evaluation"
              ? evaluationState(run.score)
              : selectedStage?.status || "Not recorded"}
          </Badge>
          <p className="mono">{selected}</p>
        </div>
      </section>
      {stages
        .filter((s) => !known.includes(s.stage))
        .map((s) => (
          <div className="trace-note" key={s.stage}>
            <Info size={16} />
            <p>
              Additional stage: <strong>{s.stage}</strong> · {s.status}.
              Dependencies were not exported and are not assumed.
            </p>
          </div>
        ))}
      <details className="config-source">
        <summary>Configuration snapshot · variant.json</summary>
        <JsonCode text={JSON.stringify(run.config, null, 2)} />
      </details>
    </>
  );
}
function SourceDrawer({
  run,
  sources,
  onClose,
}: {
  run: Run;
  sources: Details["sources"];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(sources[0]?.path || ""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const source = sources.find((s) => s.path === selected);
    setBusy(true);
    if (source)
      source.file
        .text()
        .then((value) => {
          if (active) {
            try {
              setText(JSON.stringify(JSON.parse(value), null, 2));
            } catch {
              setText(value);
            }
          }
        })
        .catch(() => {
          if (active) setText("File could not be read.");
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    else {
      setText(
        JSON.stringify(
          {
            configuration: run.config,
            status: run.result,
            evaluation: run.score,
          },
          null,
          2,
        ),
      );
      setBusy(false);
    }
    return () => {
      active = false;
    };
  }, [selected, sources]);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="source-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Original artifacts"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const els =
              e.currentTarget.querySelectorAll<HTMLElement>("button,select");
            const first = els[0],
              last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">SOURCE INSPECTOR</p>
            <h2>Original artifacts</h2>
          </div>
          <button
            ref={close}
            className="icon-btn"
            aria-label="Close source inspector"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        <p className="muted">
          {run.label} · {run.video}
        </p>
        <select
          aria-label="Source artifact"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {sources.length ? (
            sources.map((s) => (
              <option value={s.path} key={s.path}>
                {s.path.split("/").pop()}
              </option>
            ))
          ) : (
            <option value="">Configuration</option>
          )}
        </select>
        <JsonCode text={busy ? "Reading artifact…" : text} />
      </aside>
    </div>
  );
}

function ComparisonSummary({
  run,
  other,
  a,
  b,
}: {
  run: Run;
  other: Run;
  a: Details;
  b: Details;
}) {
  function flatten(doc: Doc, prefix = ""): Record<string, string> {
    return Object.fromEntries(
      Object.entries(doc).flatMap(([key, value]) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.entries(flatten(value, `${prefix}${key}.`))
          : [
              [
                `${prefix}${key}`,
                Array.isArray(value)
                  ? value.join(", ")
                  : String(value ?? "Not provided"),
              ],
            ],
      ),
    );
  }
  const left = flatten(a.profile),
    right = flatten(b.profile);
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  const changed = keys.filter((k) => left[k] !== right[k]);
  const configKeys = [
    ...new Set([...Object.keys(run.config), ...Object.keys(other.config)]),
  ].filter(
    (k) => JSON.stringify(run.config[k]) !== JSON.stringify(other.config[k]),
  );
  const valid =
    evaluationState(run.score) === "valid" &&
    evaluationState(other.score) === "valid";
  return (
    <details className="comparison-summary">
      <summary>
        {changed.length} metadata fields differ · {configKeys.length}{" "}
        configuration fields differ
        {valid
          ? ` · overall score Δ B − A: ${(other.score!.overall - run.score!.overall).toFixed(2)}`
          : " · quality delta unavailable"}
      </summary>
      <div className="comparison-summary-body">
        <h3>Configuration differences</h3>
        {configKeys.length ? (
          configKeys.map((k) => (
            <div key={k}>
              <strong>{k}</strong>
              <span>A: {JSON.stringify(run.config[k]) ?? "Not provided"}</span>
              <span>
                B: {JSON.stringify(other.config[k]) ?? "Not provided"}
              </span>
            </div>
          ))
        ) : (
          <p>Both runs use the same recorded configuration.</p>
        )}
        <h3>Whole-video metadata differences</h3>
        {changed.length ? (
          changed.map((k) => (
            <div key={k}>
              <strong>{k.replaceAll("_", " ")}</strong>
              <span>A: {left[k] || "Not provided"}</span>
              <span>B: {right[k] || "Not provided"}</span>
            </div>
          ))
        ) : (
          <p>No differences in the available profile fields.</p>
        )}
        <p>
          Only supplied fields are compared. Missing values are not interpreted
          as successful extraction. Frame identity and model-generated claims
          are not automatically judged.
        </p>
      </div>
    </details>
  );
}
