"use client";

import { useEffect, useRef, useState } from "react";
import { JsonCode } from "@/app/json-code";
import { PerformanceView } from "@/app/performance-view";
import { OverviewView, EvaluationView } from "@/app/metadata-views";
import {
  AlignedSection,
  ColumnHeadings,
  TextValue,
  TagValues,
  ViewEntry,
} from "@/app/comparison-layout";
import { PipelineView } from "@/app/pipeline-view";
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
  evaluationState,
  findFrame,
  importFiles,
  loadDetails,
  Run,
  seconds,
  transcriptFor,
  WindowData,
} from "@/lib/data";

type Tab = "Scenes" | "Overview" | "Evaluation" | "Performance" | "Pipeline";
const tabs: Tab[] = [
  "Scenes",
  "Overview",
  "Evaluation",
  "Performance",
  "Pipeline",
];
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

  const viewEntries: ViewEntry[] =
    run && details
      ? [
          { run, details },
          ...(other && otherDetails
            ? [{ run: other, details: otherDetails }]
            : []),
        ]
      : [];

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
                    ) : t === "Evaluation" ? (
                      <Check size={15} />
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
                        <p>Analysis windows recorded by the pipeline.</p>
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
                          <ScenePanel
                            run={run}
                            details={details}
                            window={currentWindow}
                            onSource={() => {
                              setSourceTarget(run.id);
                              setSourceOpen(true);
                            }}
                          >
                            {(left) =>
                              other && otherDetails && compareWindow ? (
                                <ScenePanel
                                  run={other}
                                  details={otherDetails}
                                  window={compareWindow}
                                  onSource={() => {
                                    setSourceTarget(other.id);
                                    setSourceOpen(true);
                                  }}
                                >
                                  {(right) => (
                                    <SceneSectionsView
                                      entries={viewEntries}
                                      sections={[left, right]}
                                    />
                                  )}
                                </ScenePanel>
                              ) : (
                                <SceneSectionsView
                                  entries={viewEntries}
                                  sections={[left]}
                                />
                              )
                            }
                          </ScenePanel>
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
                  <main className="content-page">
                    <OverviewView entries={viewEntries} />
                  </main>
                )}
                {tab === "Evaluation" && (
                  <main className="content-page">
                    <EvaluationView entries={viewEntries} />
                  </main>
                )}
                {tab === "Performance" && (
                  <main className="content-page">
                    <PerformanceView
                      key={`${run.id}:${other?.id || ""}`}
                      entries={viewEntries}
                      onWindow={(entry, number) => {
                        const i = entry.details.windows.findIndex(
                          (w) => w.windowNumber === number,
                        );
                        if (i < 0) return;
                        if (entry.run.id !== run.id) {
                          setSelected(entry.run.id);
                          setOtherId(run.id);
                        }
                        setIndex(i);
                        setTab("Scenes");
                      }}
                    />
                  </main>
                )}
                {tab === "Pipeline" && (
                  <main className="content-page">
                    <PipelineView entries={viewEntries} />
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

type SceneSections = {
  frames: React.ReactNode;
  transcript: React.ReactNode;
  fields: { title: string; content: React.ReactNode }[];
  summary: React.ReactNode;
  source: React.ReactNode;
};
function SceneSectionsView({
  entries,
  sections,
}: {
  entries: ViewEntry[];
  sections: SceneSections[];
}) {
  const missing = (
    <Empty title="No overlapping window">
      This run has no window in the selected interval.
    </Empty>
  );
  return (
    <div className="scene-sections">
      <ColumnHeadings entries={entries} />
      <AlignedSection title="Visual evidence" entries={entries} card={false}>
        {(_, i) => sections[i]?.frames || missing}
      </AlignedSection>
      <AlignedSection
        title="Dialogue transcript"
        entries={entries}
        card={false}
      >
        {(_, i) => sections[i]?.transcript || missing}
      </AlignedSection>
      {sections[0].fields.map((field, index) => (
        <AlignedSection title={field.title} key={field.title} entries={entries}>
          {(_, i) => sections[i]?.fields[index]?.content || missing}
        </AlignedSection>
      ))}
      <AlignedSection title="Dialogue summary" entries={entries}>
        {(_, i) => sections[i]?.summary || missing}
      </AlignedSection>
      <AlignedSection title="Original artifacts" entries={entries}>
        {(_, i) => sections[i]?.source || missing}
      </AlignedSection>
    </div>
  );
}
function ScenePanel({
  run,
  details,
  window: w,
  onSource,
  children,
}: {
  run: Run;
  details: Details;
  window: WindowData;
  onSource: () => void;
  children: (sections: SceneSections) => React.ReactNode;
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
  const sections: SceneSections = {
    frames: (
      <section className="frame-card">
        <div className="panel-heading">
          <span className="mono">
            {clock(w.start)} – {clock(w.end)}
          </span>
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
    ),
    transcript: (
      <section className="transcript-card">
        <div className="panel-heading">
          <span>{lines.length} transcript lines</span>
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
            {[...new Set(lines.map((l) => l.speaker || "UNKNOWN"))].map((s) => (
              <option key={s}>{s}</option>
            ))}
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
              Speaker labels follow the imported transcript.
            </Empty>
          )}
        </div>
        <div className="panel-footnote">
          Speaker IDs follow the transcription model’s labels.
        </div>
      </section>
    ),
    fields: [
      {
        title: "Scene description",
        content: <TextValue value={w.visual.description} />,
      },
      {
        title: "Subjects & objects",
        content: <TagValues value={w.visual.subjects_and_objects} />,
      },
      { title: "Actions", content: <TagValues value={w.visual.actions} /> },
      {
        title: "Camera & shot",
        content: <TextValue value={w.visual.camera_and_shot} />,
      },
      {
        title: "Lighting & color",
        content: <TextValue value={w.visual.lighting_and_color} />,
      },
      {
        title: "On-screen text",
        content: <TagValues value={w.visual.on_screen_text} />,
      },
    ],
    summary: (
      <>
        <TextValue
          value={w.dialogue.description || w.visual.dialogue_description}
          empty="No generated dialogue summary available."
        />
        {w.dialogue.dialogue_sampled && (
          <Badge tone="amber">Sampled dialogue input</Badge>
        )}
      </>
    ),
    source: (
      <button className="source-link" onClick={onSource}>
        <Braces size={14} />
        Inspect original artifacts <ArrowRight size={13} />
      </button>
    ),
  };
  return (
    <>
      {children(sections)}
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
    </>
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
