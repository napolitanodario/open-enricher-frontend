"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Cpu, Info, MemoryStick } from "lucide-react";
import { clock, Details, duration, isCached, Run } from "@/lib/data";
import {
  nearestSample,
  peak,
  ResourceSample,
  resourceSegments,
} from "@/lib/performance";

const metrics = [
  {
    key: "vram",
    label: "GPU memory",
    unit: "GiB",
    scope: "Driver · entire device",
    icon: MemoryStick,
  },
  {
    key: "ram",
    label: "Resident RAM",
    unit: "GiB",
    scope: "Inference process",
    icon: Activity,
  },
  {
    key: "cpu",
    label: "CPU in use",
    unit: "cores",
    scope: "Process · interval average",
    icon: Cpu,
  },
] as const;
type Metric = (typeof metrics)[number];
function value(n: number | null | undefined, metric: Metric) {
  return n == null ? "—" : (metric.key === "cpu" ? n : n / 1024).toFixed(2);
}
function memory(n: number | null) {
  return n === null ? "—" : `${(n / 1024).toFixed(2)} GiB`;
}

function ResourceChart({
  metric,
  samples,
  reference,
  compare,
  end,
  cursor,
  onCursor,
}: {
  metric: Metric;
  samples: ResourceSample[];
  reference: ResourceSample[];
  compare: boolean;
  end: number;
  cursor: number;
  onCursor: (t: number) => void;
}) {
  const maxA = peak(samples.map((s) => s[metric.key]));
  const maxB = peak(reference.map((s) => s[metric.key]));
  const ceiling = Math.max(1, maxA ?? 0, maxB ?? 0) * 1.1;
  const [width, setWidth] = useState(1000);
  const chart = useRef<SVGSVGElement>(null);
  const available = maxA !== null || maxB !== null;
  useEffect(() => {
    if (!chart.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    observer.observe(chart.current);
    return () => observer.disconnect();
  }, [available]);
  const height = 160,
    left = 60,
    right = 16,
    top = 15,
    bottom = 32;
  const x = (t: number) => left + (t / end) * (width - left - right);
  const y = (v: number) =>
    height - bottom - (v / ceiling) * (height - top - bottom);
  const readingA = nearestSample(samples, cursor),
    readingB = nearestSample(reference, cursor);
  const Icon = metric.icon;
  return (
    <section
      className={`resource-chart metric-${metric.key}`}
      aria-label={`${metric.label} over elapsed inference time`}
    >
      <div className="resource-chart-heading">
        <div>
          <Icon size={16} />
          <h3>{metric.label}</h3>
          <span>{metric.scope}</span>
        </div>
        <div className="resource-peaks">
          <span>
            A peak{" "}
            <strong>
              {value(maxA, metric)} {metric.unit}
            </strong>
          </span>
          {compare && (
            <span>
              B peak{" "}
              <strong>
                {value(maxB, metric)} {metric.unit}
              </strong>
            </span>
          )}
        </div>
      </div>
      {available ? (
        <svg
          ref={chart}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${metric.label}; A peak ${value(maxA, metric)} ${metric.unit}${compare ? `, B peak ${value(maxB, metric)} ${metric.unit}` : ""}. Use the shared time slider for exact readings.`}
          onPointerMove={(e) => {
            const bounds = e.currentTarget.getBoundingClientRect();
            onCursor(
              Math.max(
                0,
                Math.min(
                  end,
                  ((((e.clientX - bounds.left) / bounds.width) * width - left) /
                    (width - left - right)) *
                    end,
                ),
              ),
            );
          }}
        >
          {[0, 0.5, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1={left}
                x2={width - right}
                y1={y(ceiling * ratio)}
                y2={y(ceiling * ratio)}
                className="resource-grid"
              />
              <text x={left - 10} y={y(ceiling * ratio) + 4} textAnchor="end">
                {value(ceiling * ratio, metric)}
              </text>
            </g>
          ))}
          {(width < 600 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map(
            (ratio) => (
              <text
                key={ratio}
                x={x(end * ratio)}
                y={height - 8}
                textAnchor={
                  ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"
                }
              >
                {clock(end * ratio)}
              </text>
            ),
          )}
          {[samples, reference].map((series, i) =>
            resourceSegments(series, metric.key).map((segment, j) => (
              <g
                key={`${i}-${j}`}
                className={i ? "resource-line reference-line" : "resource-line"}
              >
                <path
                  d={segment
                    .map(
                      (s, index) =>
                        `${index ? "L" : "M"}${x(s.t).toFixed(2)},${y(s[metric.key]!).toFixed(2)}`,
                    )
                    .join(" ")}
                />
                {segment.length === 1 && (
                  <circle
                    cx={x(segment[0].t)}
                    cy={y(segment[0][metric.key]!)}
                    r={3}
                  />
                )}
              </g>
            )),
          )}
          <line
            x1={x(cursor)}
            x2={x(cursor)}
            y1={top}
            y2={height - bottom}
            className="resource-cursor"
          />
          {[readingA, readingB].map(
            (sample, i) =>
              sample?.[metric.key] != null && (
                <circle
                  key={i}
                  cx={x(sample.t)}
                  cy={y(sample[metric.key]!)}
                  r={4}
                  className={
                    i ? "resource-point reference-point" : "resource-point"
                  }
                />
              ),
          )}
        </svg>
      ) : (
        <p className="resource-unavailable">
          No {metric.label.toLowerCase()} measurements in the imported samples.
        </p>
      )}
      <div className="resource-readings">
        <span>
          A{" "}
          <strong>
            {value(readingA?.[metric.key], metric)} {metric.unit}
          </strong>
          <small>
            {readingA ? `sample ${clock(readingA.t)}` : "No sample here"}
          </small>
        </span>
        {compare && (
          <span>
            B{" "}
            <strong>
              {value(readingB?.[metric.key], metric)} {metric.unit}
            </strong>
            <small>
              {readingB ? `sample ${clock(readingB.t)}` : "No sample here"}
            </small>
          </span>
        )}
      </div>
    </section>
  );
}

export function HardwarePerformance({
  run,
  details,
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
  const [cursor, setCursor] = useState(0);
  const [tableRun, setTableRun] = useState("A");
  const [stage, setStage] = useState("all");
  const samples = details.hardware.samples;
  const reference = otherDetails?.hardware.samples || [];
  const lastSample = Math.max(
    0,
    samples.at(-1)?.t ?? 0,
    reference.at(-1)?.t ?? 0,
  );
  const end = Math.max(1, lastSample);
  const compare = !!other && !!otherDetails;
  const selectedRun = tableRun === "B" && compare ? other : run;
  const selectedDetails = tableRun === "B" && compare ? otherDetails : details;
  const spans = selectedDetails.hardware.spans;
  const stages = [...new Set(spans.map((s) => s.stage))];
  const hasPeaks = [
    ...details.hardware.spans,
    ...(otherDetails?.hardware.spans || []),
  ].some((s) => s.reserved !== null || s.allocated !== null);
  const scale = Math.max(
    1,
    peak(spans.flatMap((s) => [s.reserved, s.allocated])) ?? 0,
  );
  const filtered = spans.filter((s) => stage === "all" || s.stage === stage);
  return (
    <div className="hardware-performance">
      <div className="section-heading">
        <div>
          <p className="eyebrow">INFERENCE RESOURCES</p>
          <h2>Hardware over time</h2>
          <p className="muted">
            Memory and CPU sampled during this video’s pipeline run. Elapsed
            time starts at inference launch.
          </p>
        </div>
        <span className="badge">5-second samples</span>
      </div>
      {samples.length || reference.length ? (
        <>
          <div className="resource-run-legend">
            <span>
              <i />A · {run.label}
              <small>{samples.length} samples</small>
            </span>
            {compare && (
              <span>
                <i className="reference-line" />B · {other.label}
                <small>{reference.length} samples</small>
              </span>
            )}
          </div>
          <div className="resource-charts">
            {metrics.map((metric) => (
              <ResourceChart
                key={metric.key}
                metric={metric}
                samples={samples}
                reference={reference}
                compare={compare}
                end={end}
                cursor={cursor}
                onCursor={setCursor}
              />
            ))}
          </div>
          <div className="resource-scrubber">
            <label htmlFor="hardware-time">
              Inspect elapsed time <strong>{clock(cursor)}</strong>
            </label>
            <input
              id="hardware-time"
              type="range"
              min={0}
              max={lastSample}
              step={1}
              value={cursor}
              onChange={(e) => setCursor(Number(e.target.value))}
              aria-valuetext={`${clock(cursor)} since inference launch`}
            />
            <span>{clock(lastSample)} last sample</span>
          </div>
          <p className="resource-footnote">
            Hover a chart or use the shared slider to inspect the nearest
            sample. A/B share elapsed-time and value scales; sampling gaps stay
            empty. The last sample is not the exact run duration.
          </p>
        </>
      ) : (
        <div className="empty resource-empty">
          <MemoryStick size={22} />
          <strong>No hardware time series available</strong>
          <p>
            Include <code>performance/{run.video}_vram.csv</code> when importing
            the run folder. Older archives still show recorded durations and any
            available per-operation peaks.
          </p>
        </div>
      )}
      <div className="trace-note hardware-semantics">
        <Info size={16} />
        <p>
          GPU memory is device-wide and can include other processes. RAM and CPU
          refer to the inference process; CPU is measured in busy cores, not
          percent. Per-operation peaks below come from PyTorch and differ from
          driver readings. Timing exports contain no operation start offsets, so
          resource samples cannot be assigned to individual stages.
        </p>
      </div>
      {hasPeaks && (
        <section className="operation-peaks">
          <div className="operation-heading">
            <div>
              <h3>VRAM peaks by operation</h3>
              <p>
                Duration and allocator peaks for each recorded operation.
                Reserved memory includes PyTorch’s cache; allocated memory holds
                live tensors.
              </p>
            </div>
            <div className="operation-filters">
              {compare && (
                <label>
                  Execution
                  <select
                    aria-label="Operation execution"
                    value={tableRun}
                    onChange={(e) => {
                      setTableRun(e.target.value);
                      setStage("all");
                    }}
                  >
                    <option value="A">A · {run.label}</option>
                    <option value="B">B · {other.label}</option>
                  </select>
                </label>
              )}
              <label>
                Stage
                <select
                  aria-label="Operation stage"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                >
                  <option value="all">All stages</option>
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div
            className="operation-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Operation durations and VRAM peaks"
          >
            <table className="operation-table">
              <thead>
                <tr>
                  <th>Stage / operation</th>
                  <th>Window</th>
                  <th>Duration</th>
                  <th>Reserved peak</th>
                  <th>Allocated peak</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((span, i) => {
                  const cached = isCached(selectedRun, span.stage);
                  const windowIndex = selectedDetails.windows.findIndex(
                    (w) => w.windowNumber === span.window,
                  );
                  return (
                    <tr key={i}>
                      <td>
                        <span className="operation-stage">
                          {span.stage}
                          {cached && (
                            <span className="badge amber">
                              Reused · historical peak
                            </span>
                          )}
                        </span>
                        <strong>{span.name.replaceAll("_", " ")}</strong>
                      </td>
                      <td>
                        {span.window !== null ? (
                          selectedRun === run && windowIndex >= 0 ? (
                            <button
                              className="window-jump"
                              onClick={() => onWindow(windowIndex)}
                            >
                              #{span.window}
                            </button>
                          ) : (
                            `#${span.window}`
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{duration(span.seconds ?? NaN)}</td>
                      {[span.reserved, span.allocated].map((n, j) => (
                        <td key={j}>
                          <span>{memory(n)}</span>
                          <div
                            className={`peak-track ${j ? "allocated" : "reserved"}`}
                          >
                            {n !== null && (
                              <i style={{ width: `${(n / scale) * 100}%` }} />
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="resource-unavailable">
                No operation peaks available for this selection.
              </p>
            )}
          </div>
          <p className="resource-footnote">
            All memory values are shown in GiB (CSV MiB ÷ 1024). Reused
            operations describe the original computation, not current inference
            usage. Missing measurements are shown as —.
          </p>
        </section>
      )}
    </div>
  );
}
