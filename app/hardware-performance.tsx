"use client";

import { useEffect, useRef, useState } from "react";
import { clock } from "@/lib/data";
import {
  nearestSample,
  peak,
  ResourceSample,
  resourceSegments,
} from "@/lib/performance";

export const resourceMetrics = [
  { key: "vram", label: "GPU memory", unit: "GiB" },
  { key: "ram", label: "Resident RAM", unit: "GiB" },
  { key: "cpu", label: "CPU in use", unit: "cores" },
] as const;
export type ResourceMetric = (typeof resourceMetrics)[number];
function value(n: number | null | undefined, metric: ResourceMetric) {
  return n == null ? "—" : (metric.key === "cpu" ? n : n / 1024).toFixed(2);
}
export function ResourceChart({
  metric,
  samples,
  scale,
  end,
  cursor,
  onCursor,
  activeStage,
}: {
  metric: ResourceMetric;
  samples: ResourceSample[];
  scale: number;
  end: number;
  cursor: number | null;
  onCursor: (time: number) => void;
  activeStage?: string;
}) {
  const max = peak(samples.map((s) => s[metric.key]));
  const ceiling = Math.max(1, scale) * 1.1;
  const [width, setWidth] = useState(600);
  const chart = useRef<SVGSVGElement>(null);
  const available = max !== null;
  useEffect(() => {
    if (!chart.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(250, entry.contentRect.width)),
    );
    observer.observe(chart.current);
    return () => observer.disconnect();
  }, [available]);
  const height = 180,
    left = 54,
    right = 16,
    top = 22,
    bottom = 35;
  const x = (t: number) => left + (t / end) * (width - left - right);
  const y = (v: number) =>
    height - bottom - (v / ceiling) * (height - top - bottom);
  const reading = cursor === null ? undefined : nearestSample(samples, cursor);
  return (
    <div className={`resource-chart metric-${metric.key}`}>
      <div className="resource-chart-heading">
        <span>
          Peak{" "}
          <strong>
            {value(max, metric)} {metric.unit}
          </strong>
        </span>
        <span>{samples.length} samples</span>
      </div>
      {available ? (
        <svg
          ref={chart}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          tabIndex={0}
          aria-label={`${metric.label} over elapsed inference time. Use left and right arrow keys to inspect readings.`}
          onKeyDown={(e) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              onCursor(
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? end
                    : Math.max(
                        0,
                        Math.min(
                          end,
                          (cursor ?? 0) + (e.key === "ArrowLeft" ? -5 : 5),
                        ),
                      ),
              );
            }
          }}
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
          {resourceSegments(samples, metric.key).map((segment, i) => (
            <g key={i} className="resource-line">
              <path
                d={segment
                  .map(
                    (s, j) =>
                      `${j ? "L" : "M"}${x(s.t).toFixed(2)},${y(s[metric.key]!).toFixed(2)}`,
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
          ))}
          {cursor !== null && (
            <line
              x1={x(cursor)}
              x2={x(cursor)}
              y1={top}
              y2={height - bottom}
              className="resource-cursor"
            />
          )}
          {reading?.[metric.key] != null && (
            <circle
              cx={x(reading.t)}
              cy={y(reading[metric.key]!)}
              r={4}
              className="resource-point"
            />
          )}
        </svg>
      ) : (
        <p className="resource-unavailable">No measurements available.</p>
      )}
      <div className="resource-readings">
        <strong>
          {value(reading?.[metric.key], metric)} {metric.unit}
        </strong>
        <span>
          {cursor === null
            ? "Move across a chart to inspect"
            : reading
              ? `Sample ${clock(reading.t)}`
              : "No sample at this time"}
        </span>
        {activeStage && <span className="badge">{activeStage}</span>}
      </div>
    </div>
  );
}
