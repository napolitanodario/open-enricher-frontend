"use client";
import { useState } from "react";
import { Activity, Check, Film, Layers3 } from "lucide-react";
import { evaluationState } from "@/lib/data";
import {
  AlignedSection,
  ColumnHeadings,
  ComparisonColumns,
  ViewEntry,
} from "./comparison-layout";
import { JsonCode } from "./json-code";
const stageNames: Record<string, string> = {
  audio: "Audio & speakers",
  dialogue: "Dialogue understanding",
  vlm: "Visual understanding",
  llm: "Metadata synthesis",
  evaluation: "Evaluation",
};
const known = ["audio", "dialogue", "vlm", "llm"];
function Diagram({
  entry,
  selected,
  setSelected,
}: {
  entry: ViewEntry;
  selected: string;
  setSelected: (s: string) => void;
}) {
  const { run, details } = entry;
  const stages = run.result.stages || details.timings.stages || [];
  return (
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
                : stages.find(
                    (s: { stage: string; status?: string }) => s.stage === name,
                  )?.status || "Not recorded"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
export function PipelineView({ entries }: { entries: ViewEntry[] }) {
  const [selected, setSelected] = useState("vlm");
  function description(entry: ViewEntry) {
    return (
      {
        audio:
          "Transcription, alignment and speaker diarization produce timestamped dialogue.",
        dialogue:
          "A generated plot and per-window dialogue descriptions are derived from the transcript.",
        vlm: entry.run.config.visual_only
          ? "Visual metadata is extracted from video windows and previous-window memory."
          : "Visual metadata is extracted from video windows, dialogue descriptions and previous-window metadata.",
        llm: "The generated plot and accumulated scene metadata are synthesized into a whole-video profile.",
        evaluation:
          "An external provider assesses the final profile and records scores and explanations.",
      } as Record<string, string>
    )[selected];
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">EXTRACTION STRUCTURE</p>
          <h2>From video to metadata</h2>
          <p className="muted">
            Pipeline dependencies and the configuration recorded for each
            execution.
          </p>
        </div>
      </div>
      <ColumnHeadings entries={entries} />
      <AlignedSection title="Configuration" entries={entries}>
        {({ run }) => (
          <dl className="device-details">
            <div>
              <dt>Analysis window</dt>
              <dd>{run.config.interval_seconds || "—"} seconds</dd>
            </div>
            <div>
              <dt>VLM memory</dt>
              <dd>
                {run.config.vlm_memory_scenes == null
                  ? "All previous windows"
                  : `${run.config.vlm_memory_scenes} windows`}
              </dd>
            </div>
            <div>
              <dt>Dialogue input</dt>
              <dd>{run.config.visual_only ? "Disabled" : "Enabled"}</dd>
            </div>
          </dl>
        )}
      </AlignedSection>
      <AlignedSection title="Pipeline data flow" entries={entries} card={false}>
        {(entry) => (
          <Diagram
            entry={entry}
            selected={selected}
            setSelected={setSelected}
          />
        )}
      </AlignedSection>
      <AlignedSection
        title={stageNames[selected]}
        eyebrow="SELECTED STAGE"
        entries={entries}
      >
        {(entry) => (
          <>
            <p className="long-text">{description(entry)}</p>
            <span className="badge">
              {selected === "evaluation"
                ? evaluationState(entry.run.score)
                : entry.run.result.stages?.find(
                    (s: { stage: string }) => s.stage === selected,
                  )?.status || "Not recorded"}
            </span>
          </>
        )}
      </AlignedSection>
      {[
        ...new Set(
          entries.flatMap((entry) =>
            (entry.run.result.stages || entry.details.timings.stages || []).map(
              (stage: { stage: string }) => stage.stage,
            ),
          ),
        ),
      ]
        .filter((name) => !known.includes(name))
        .map((name) => (
          <AlignedSection
            key={name}
            title={name}
            eyebrow="ADDITIONAL STAGE"
            entries={entries}
          >
            {(entry) => (
              <p className="long-text">
                {entry.run.result.stages?.find(
                  (stage: { stage: string }) => stage.stage === name,
                )?.status || "Not recorded"}{" "}
                · Dependencies are unavailable in this archive.
              </p>
            )}
          </AlignedSection>
        ))}
      <section className="aligned-section">
        <details className="config-source">
          <summary>Configuration snapshot · variant.json</summary>
          <ComparisonColumns entries={entries}>
            {(entry) => (
              <JsonCode text={JSON.stringify(entry.run.config, null, 2)} />
            )}
          </ComparisonColumns>
        </details>
      </section>
    </>
  );
}
