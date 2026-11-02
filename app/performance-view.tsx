"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { clock, duration, isCached } from "@/lib/data";
import { peak } from "@/lib/performance";
import {
  buildTimeline,
  Interval,
  phaseRows,
  TraceOperation,
  TraceStage,
} from "@/lib/timeline";
import {
  AlignedSection,
  ColumnHeadings,
  ComparisonColumns,
  ViewEntry,
} from "./comparison-layout";
import { ResourceChart, resourceMetrics } from "./hardware-performance";

const stageNames: Record<string, string> = {
  audio: "Audio & speakers",
  dialogue: "Dialogue understanding",
  vlm: "Visual understanding",
  llm: "Metadata synthesis",
};
function category(name: string) {
  return /load/.test(name)
    ? "load"
    : /align/.test(name)
      ? "align"
      : /diariz/.test(name)
        ? "diarize"
        : "generate";
}
function memory(n: number | null | undefined) {
  return n == null ? "—" : `${(n / 1024).toFixed(2)} GiB`;
}
function intervalStyle(interval: Interval, end: number) {
  return {
    left: `${(interval.start / end) * 100}%`,
    width: `${((interval.end - interval.start) / end) * 100}%`,
  };
}
function PhaseBar({
  stage,
  operation,
  end,
  compositionEnd,
  cursor,
  onCursor,
  onWindow,
}: {
  stage?: TraceStage;
  operation?: TraceOperation;
  end: number;
  compositionEnd: number;
  cursor: number | null;
  onCursor: (n: number) => void;
  onWindow?: (window: number) => void;
}) {
  if (
    !stage ||
    (operation === undefined &&
      !stage.operations.length &&
      stage.seconds === null &&
      !stage.interval)
  )
    return <div className="trace-unavailable">No recorded operation</div>;
  const timed = !!stage.interval && !stage.cached;
  const span = operation?.interval;
  const active =
    !!span && cursor !== null && cursor >= span.start && cursor <= span.end;
  if (stage.cached)
    return (
      <div className="trace-band trace-cached">
        <div className="trace-band-caption">
          <span>From cached artifact</span>
          <strong>
            {duration((operation ? operation.seconds : stage.seconds) ?? NaN)}
          </strong>
        </div>
        <p className="trace-cache-note">
          Original computation retained in the archive.
        </p>
      </div>
    );
  return (
    <div
      className={`trace-band ${stage.cached ? "trace-cached" : ""} ${active ? "trace-active" : ""}`}
    >
      <div className="trace-band-caption">
        <span>
          {stage.cached
            ? "Reused computation"
            : timed
              ? operation && !span
                ? "Timestamp unavailable"
                : ""
              : "Phase durations"}
        </span>
        <strong>
          {duration((operation ? operation.seconds : stage.seconds) ?? NaN)}
        </strong>
      </div>
      <div className="trace-plot-padding">
        <div
          className="timeline-plot"
          onPointerMove={
            timed
              ? (e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onCursor(
                    Math.max(
                      0,
                      Math.min(end, ((e.clientX - r.left) / r.width) * end),
                    ),
                  );
                }
              : undefined
          }
        >
          {!operation && stage.interval && (
            <i
              className="trace-envelope"
              style={intervalStyle(stage.interval, end)}
            />
          )}
          {(operation ? [operation] : stage.operations).map((op) => {
            const interval = timed ? op.interval : op.composition;
            if (!interval) return null;
            return (
              <button
                key={op.key}
                className={`trace-segment ${category(op.name)}`}
                style={intervalStyle(interval, timed ? end : compositionEnd)}
                aria-label={`${op.name}${op.window !== null ? ` window ${op.window}` : ""}: ${duration(op.seconds ?? NaN)}`}
                title={`${op.name}${op.window !== null ? ` · window ${op.window}` : ""}\n${timed ? `${clock(interval.start)} – ${clock(interval.end)}\n` : ""}${duration(op.seconds ?? NaN)}`}
                onClick={() => {
                  if (timed && op.interval)
                    onCursor((op.interval.start + op.interval.end) / 2);
                  if (op.window !== null) onWindow?.(op.window);
                }}
              />
            );
          })}
          {timed && cursor !== null && (
            <i
              className="trace-time-cursor"
              style={{ left: `${(cursor / end) * 100}%` }}
            />
          )}
        </div>
      </div>
      {operation?.modelId && <p className="phase-model">{operation.modelId}</p>}
      {operation && timed && !span && operation.seconds !== null && (
        <p className="trace-fallback-duration">
          Recorded duration {duration(operation.seconds)}
        </p>
      )}
    </div>
  );
}

export function PerformanceView({
  entries,
  onWindow,
}: {
  entries: ViewEntry[];
  onWindow: (entry: ViewEntry, window: number) => void;
}) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string[]>(["vlm"]);
  const [filter, setFilter] = useState("all");
  const timelines = useMemo(
    () =>
      entries.map((e) =>
        buildTimeline(
          e.details.timings.stages || [],
          e.details.hardware,
          [
            ...new Set([
              ...(e.details.timings.stages || []).map(
                (s: { stage: string }) => s.stage,
              ),
              ...e.details.hardware.spans.map((s) => s.stage),
            ]),
          ].filter((name) => isCached(e.run, name)),
        ),
      ),
    [entries],
  );
  const end = Math.max(1, ...timelines.map((t) => t.end));
  const names = [
    ...new Set(timelines.flatMap((t) => t.stages.map((s) => s.name))),
  ];
  const compositionEnd = Math.max(
    1,
    ...timelines.flatMap((t) =>
      t.stages.map((s) => Math.max(s.seconds ?? 0, s.compositionSeconds)),
    ),
  );
  // Operation identities include their stage, so equal names in different stages stay distinct.
  const rows = names.flatMap((name) =>
    phaseRows(timelines.map((t) => t.stages.find((s) => s.name === name))).map(
      (row) => ({ ...row, stage: name }),
    ),
  );
  const hasResources = timelines.some((t) => t.samples.length);
  const hasDevice = entries.some((e) => e.details.hardware.device);
  return (
    <div className="performance-view">
      <div className="section-heading">
        <div>
          <p className="eyebrow">EXECUTION & RESOURCES</p>
          <h2>Performance</h2>
          <p className="muted">
            Explore each stage, its operations and the hardware used during
            inference.
          </p>
        </div>
        <span className="badge">
          {timelines.some((t) => t.stages.some((s) => s.interval))
            ? "Timestamped trace"
            : "Duration breakdown"}
        </span>
      </div>
      <ColumnHeadings entries={entries} />
      <AlignedSection title="Execution summary" entries={entries}>
        {(entry, i) => {
          const stages = timelines[i].stages;
          const wall = stages.filter((s) => !s.cached && s.seconds !== null);
          const cached = stages.filter((s) => s.cached && s.seconds !== null);
          return (
            <div className="execution-stats">
              <div>
                <span>Executed stage durations</span>
                <strong>
                  {wall.length
                    ? duration(wall.reduce((sum, s) => sum + s.seconds!, 0))
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Reused computation</span>
                <strong>
                  {cached.length
                    ? duration(cached.reduce((sum, s) => sum + s.seconds!, 0))
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Recorded stages</span>
                <strong>{stages.length}</strong>
              </div>
            </div>
          );
        }}
      </AlignedSection>
      {hasDevice && (
        <AlignedSection title="Inference hardware" entries={entries}>
          {(entry) => {
            const d = entry.details.hardware.device;
            return d ? (
              <dl className="device-details">
                <div>
                  <dt>GPU</dt>
                  <dd>
                    {d.devices.length
                      ? d.devices
                          .map(
                            (g) => `${g.name} · ${memory(g.total_memory_mib)}`,
                          )
                          .join(" / ")
                      : "No CUDA device recorded"}
                  </dd>
                </div>
                <div>
                  <dt>CPU</dt>
                  <dd>
                    {d.host.cpu_model || "Model unavailable"}
                    {d.host.cpu_count !== null
                      ? ` · ${d.host.cpu_count} logical CPUs`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>System RAM</dt>
                  <dd>{memory(d.host.ram_total_mib)}</dd>
                </div>
                {d.cuda_version && (
                  <div>
                    <dt>CUDA</dt>
                    <dd>{d.cuda_version}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="muted">No device snapshot in this archive.</p>
            );
          }}
        </AlignedSection>
      )}
      <section
        className="aligned-section trace-explorer"
        data-section="Execution trace"
      >
        <div className="shared-section-heading">
          <p className="eyebrow">STAGES & OPERATIONS</p>
          <h3>Execution trace</h3>
          <p className="muted">
            Expand a stage to inspect its phases and analysis windows.
          </p>
        </div>
        <div className="trace-legend">
          <span>
            <i className="load" />
            Model load
          </span>
          <span>
            <i className="generate" />
            Processing
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
        <ComparisonColumns entries={entries}>
          {(_, i) => (
            <div className="trace-clock-label">
              {timelines[i].stages.some((s) => s.interval)
                ? `Elapsed from ${new Date(timelines[i].origin!).toISOString().replace("T", " ").replace(".000Z", " UTC")}`
                : "Phase duration composition"}
              <div className="trace-axis-labels">
                <span>0 s</span>
                <span>
                  {duration(
                    timelines[i].stages.some((s) => s.interval)
                      ? end / 2
                      : compositionEnd / 2,
                  )}
                </span>
                <span>
                  {duration(
                    timelines[i].stages.some((s) => s.interval)
                      ? end
                      : compositionEnd,
                  )}
                </span>
              </div>
            </div>
          )}
        </ComparisonColumns>
        {!names.length && (
          <div className="empty">
            <strong>No timing artifacts available</strong>
          </div>
        )}
        {names.map((name) => {
          const stages = timelines.map((t) =>
            t.stages.find((s) => s.name === name),
          );
          const phases = phaseRows(stages);
          return (
            <section className="trace-stage-group" key={name} data-stage={name}>
              <button
                className="trace-stage-heading"
                onClick={() =>
                  setExpanded((s) =>
                    s.includes(name)
                      ? s.filter((n) => n !== name)
                      : [...s, name],
                  )
                }
                aria-expanded={expanded.includes(name)}
              >
                <ChevronDown
                  size={16}
                  className={expanded.includes(name) ? "" : "collapsed"}
                />
                <strong>{stageNames[name] || name}</strong>
                <span>{phases.length} operations</span>
              </button>
              <ComparisonColumns entries={entries}>
                {(entry, i) => (
                  <PhaseBar
                    stage={stages[i]}
                    end={end}
                    compositionEnd={compositionEnd}
                    cursor={cursor}
                    onCursor={setCursor}
                    onWindow={(n) => onWindow(entry, n)}
                  />
                )}
              </ComparisonColumns>
              {expanded.includes(name) &&
                phases.map((phase) => (
                  <div className="trace-phase-row" key={phase.key}>
                    <div className="trace-phase-label">
                      <i className={`phase-dot ${category(phase.name)}`} />
                      <span>{phase.name.replaceAll("_", " ")}</span>
                      {phase.window !== null && (
                        <span className="badge">Window {phase.window}</span>
                      )}
                      {phase.attempt && (
                        <span className="badge">Attempt {phase.attempt}</span>
                      )}
                    </div>
                    <ComparisonColumns entries={entries}>
                      {(entry, i) => {
                        const op = stages[i]?.operations.find(
                          (s) => s.key === phase.key,
                        );
                        return op ? (
                          <PhaseBar
                            stage={stages[i]}
                            operation={op}
                            end={end}
                            compositionEnd={compositionEnd}
                            cursor={cursor}
                            onCursor={setCursor}
                            onWindow={(n) => onWindow(entry, n)}
                          />
                        ) : (
                          <div className="trace-unavailable">Not recorded</div>
                        );
                      }}
                    </ComparisonColumns>
                  </div>
                ))}
            </section>
          );
        })}
      </section>
      <ul className="explanation-list">
        <li>
          Stage bars include the phases and windows recorded within that stage.
          Gaps show time between recorded operations.
        </li>
        <li>
          Older exports use a composition of phase durations. Cached stages
          retain the measurements of their original execution.
        </li>
      </ul>
      <div className="shared-section-heading hardware-title">
        <p className="eyebrow">INFERENCE RESOURCES</p>
        <h3>Hardware over time</h3>
        <p className="muted">
          Move across any chart to inspect the same instant throughout the view.
          Arrow keys are also available when a chart is focused.
        </p>
        <span className="inspection-cursor-label">
          {cursor === null ? "Hover to inspect" : `Elapsed ${clock(cursor)}`}
        </span>
      </div>
      {hasResources ? (
        resourceMetrics.map((metric) => {
          const scale = Math.max(
            1,
            ...timelines.map(
              (t) => peak(t.samples.map((s) => s[metric.key])) ?? 0,
            ),
          );
          return (
            <AlignedSection
              key={metric.key}
              title={metric.label}
              entries={entries}
              card={false}
            >
              {(_, i) => {
                const t = timelines[i];
                const active =
                  t.alignedResources && cursor !== null
                    ? t.stages
                        .filter(
                          (s) =>
                            s.interval &&
                            cursor >= s.interval.start &&
                            cursor <= s.interval.end,
                        )
                        .map((s) => stageNames[s.name] || s.name)
                        .join(" · ")
                    : undefined;
                return (
                  <ResourceChart
                    metric={metric}
                    samples={t.samples}
                    scale={scale}
                    end={end}
                    cursor={cursor}
                    onCursor={setCursor}
                    activeStage={active}
                  />
                );
              }}
            </AlignedSection>
          );
        })
      ) : (
        <div className="empty resource-empty">
          <strong>No hardware samples available</strong>
          <p>Include the performance folder when importing this execution.</p>
        </div>
      )}
      {timelines.some(
        (t) =>
          t.samples.length &&
          !t.alignedResources &&
          t.stages.some((s) => s.interval),
      ) && (
        <p className="inline-warning">
          Resource samples in an older export use a separate elapsed-time
          origin. Stage labels are available with timestamped samples.
        </p>
      )}
      <ul className="explanation-list">
        <li>
          GPU memory follows all activity on the busiest visible device. RAM and
          CPU readings follow the inference process, with CPU expressed as
          average busy cores between samples.
        </li>
        <li>
          Samples are collected about every five seconds. Hover readings show
          the closest available sample and preserve gaps in the recording.
        </li>
        <li>
          Memory values use GiB. The operation table reports PyTorch’s reserved
          memory and the memory allocated to live tensors.
        </li>
      </ul>
      {!!rows.length && (
        <section
          className="aligned-section operation-peaks"
          data-section="VRAM peaks by operation"
        >
          <div className="operation-heading">
            <div>
              <p className="eyebrow">OPERATION DETAIL</p>
              <h3>VRAM peaks by operation</h3>
            </div>
            <label>
              Stage
              <select
                aria-label="Operation stage"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All stages</option>
                {names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="operation-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Operation durations and VRAM peaks"
          >
            <table className="operation-table">
              <thead>
                {entries.length > 1 && (
                  <tr>
                    <th>Operation</th>
                    {entries.map((entry, i) => (
                      <th key={entry.run.id} colSpan={3}>
                        {i ? "B" : "A"} · {entry.run.label}
                      </th>
                    ))}
                  </tr>
                )}
                <tr>
                  <th>Stage / operation / window</th>
                  {entries.map((entry) => (
                    <Fragment key={entry.run.id}>
                      {["Duration", "Reserved", "Allocated"].map((label) => (
                        <th key={`${entry.run.id}-${label}`}>{label}</th>
                      ))}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((row) => filter === "all" || row.stage === filter)
                  .map((row) => (
                    <tr key={`${row.stage}:${row.key}`}>
                      <td>
                        <span className="operation-stage">{row.stage}</span>
                        <strong>
                          {row.name.replaceAll("_", " ")}
                          {row.window !== null ? ` · #${row.window}` : ""}
                        </strong>
                      </td>
                      {entries.map((entry, i) => {
                        const stage = timelines[i].stages.find(
                          (s) => s.name === row.stage,
                        );
                        const op = stage?.operations.find(
                          (s) => s.key === row.key,
                        );
                        return (
                          <Fragment key={entry.run.id}>
                            <td>
                              {duration(op?.seconds ?? NaN)}
                              {stage?.cached && (
                                <span className="badge amber">Reused</span>
                              )}
                            </td>
                            <td>{memory(op?.reserved)}</td>
                            <td>{memory(op?.allocated)}</td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <ul className="explanation-list operation-notes">
            <li>
              Memory is converted from CSV MiB to GiB by dividing by 1024.
            </li>
            <li>
              Reused operations keep the peaks measured during the original
              execution.
            </li>
            <li>A dash (—) marks an unavailable measurement.</li>
          </ul>
        </section>
      )}
    </div>
  );
}
