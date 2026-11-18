import {
  AlignedSection,
  ColumnHeadings,
  TagValues,
  TextValue,
  ViewEntry,
} from "./comparison-layout";
import { evaluationState } from "@/lib/data";

export function OverviewView({ entries }: { entries: ViewEntry[] }) {
  const fields = [
    [
      "Narrative hook",
      (e: ViewEntry) => e.details.profile.content_summary?.narrative_hook,
    ],
    [
      "Visual style",
      (e: ViewEntry) => e.details.profile.content_summary?.visual_style,
    ],
    [
      "Primary genre",
      (e: ViewEntry) => e.details.profile.recsys_metadata?.primary_genre,
    ],
    ["Pacing", (e: ViewEntry) => e.details.profile.recsys_metadata?.pacing],
    [
      "Target audience",
      (e: ViewEntry) => e.details.profile.audience_profiling?.target_age_group,
    ],
  ] as const;
  const tags = [
    [
      "Subgenres",
      (e: ViewEntry) => e.details.profile.recsys_metadata?.sub_genres,
    ],
    ["Mood", (e: ViewEntry) => e.details.profile.recsys_metadata?.mood],
    [
      "Semantic tags",
      (e: ViewEntry) => e.details.profile.search_and_discovery?.semantic_tags,
    ],
    [
      "Topics",
      (e: ViewEntry) => e.details.profile.search_and_discovery?.main_topics,
    ],
    [
      "Viewer interests",
      (e: ViewEntry) => e.details.profile.audience_profiling?.viewer_interests,
    ],
  ] as const;
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">WHOLE-VIDEO OUTPUT</p>
          <h2>Beyond individual scenes</h2>
        </div>
      </div>
      <ColumnHeadings entries={entries} />
      {fields.map(([title, get]) => (
        <AlignedSection
          key={title}
          title={title}
          entries={entries}
          className={title === "Narrative hook" ? "narrative-section" : ""}
        >
          {(entry) => <TextValue value={get(entry)} />}
        </AlignedSection>
      ))}
      {tags.map(([title, get]) => (
        <AlignedSection key={title} title={title} entries={entries}>
          {(entry) => <TagValues value={get(entry)} />}
        </AlignedSection>
      ))}
    </>
  );
}

export function EvaluationView({ entries }: { entries: ViewEntry[] }) {
  const references = [
    ...new Set(entries.map((e) => e.details.synopsis).filter(Boolean)),
  ];
  const sameVideo = entries.every((e) => e.run.video === entries[0].run.video);
  const dimensions = [
    ...new Set(
      entries.flatMap((e) =>
        evaluationState(e.run.score) === "valid"
          ? Object.keys(e.run.score?.dimensions || {})
          : [],
      ),
    ),
  ];
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">QUALITY & REFERENCE</p>
          <h2>Evaluation</h2>
          <p className="muted">
            Generated plot, reference synopsis and the provider’s archived
            assessment.
          </p>
        </div>
      </div>
      <ColumnHeadings entries={entries} />
      {sameVideo && references.length <= 1 ? (
        <section
          className="aligned-section reference-section"
          data-section="Synopsis"
        >
          <div className="shared-section-heading">
            <p className="eyebrow">REFERENCE MATERIAL</p>
            <h3>Synopsis</h3>
          </div>
          <div className="shared-reference">
            <TextValue
              value={references[0]}
              empty="No synopsis imported. Include synopsis/<video>_summary.txt with the archive."
            />
          </div>
        </section>
      ) : (
        <AlignedSection
          title="Synopsis"
          eyebrow="REFERENCE MATERIAL"
          description="The imported reference texts differ between these archives."
          entries={entries}
        >
          {(entry) => <TextValue value={entry.details.synopsis} />}
        </AlignedSection>
      )}
      <AlignedSection
        title="Plot summary"
        eyebrow="GENERATED OUTPUT"
        entries={entries}
      >
        {(entry) => (
          <TextValue
            value={entry.details.dialogue.plot_summary}
            empty="No generated plot summary available."
          />
        )}
      </AlignedSection>
      <AlignedSection
        title="Metadata evaluation"
        eyebrow="EXTERNAL PROVIDER"
        entries={entries}
      >
        {(entry, i) => {
          const score = entry.run.score,
            state = evaluationState(score);
          if (state === "missing")
            return (
              <div className="evaluation-state">
                <strong>Not evaluated</strong>
                <p>Import score.json to read the provider’s assessment.</p>
              </div>
            );
          if (state === "failed")
            return (
              <div className="evaluation-error">
                <strong>Evaluation failed</strong>
                <p>
                  {score!.error ||
                    "The report contains invalid data or parsing errors."}
                </p>
              </div>
            );
          const base = entries[0].run.score;
          return (
            <div className="evaluation-report">
              <div className="evaluation-score-row">
                <div className="big-score">
                  {score!.overall.toFixed(2)}
                  <span>/ 5</span>
                </div>
                <span className={`badge ${score!.usable ? "green" : "amber"}`}>
                  {score!.usable ? "Usable" : "Below usability threshold"}
                </span>
              </div>
              {entries.length > 1 && (
                <p className="evaluation-delta">
                  {i > 0 && evaluationState(base) === "valid"
                    ? `Δ B − A: ${(score!.overall - base!.overall).toFixed(2)}`
                    : "\u00a0"}
                </p>
              )}
              <p className="evaluation-provider">
                {score!.method?.provider || "Provider unknown"} ·{" "}
                {score!.method?.model || "Model unknown"}
              </p>
              <p className="muted">
                Reference:{" "}
                {score!.method?.uses_synopsis
                  ? "synopsis"
                  : "title / model knowledge"}
              </p>
              <TextValue value={score!.summary} />
            </div>
          );
        }}
      </AlignedSection>
      {dimensions.map((name) => (
        <AlignedSection
          title={name.replaceAll("_", " ")}
          key={name}
          entries={entries}
        >
          {(entry, i) => {
            const score = entry.run.score;
            const d =
              evaluationState(score) === "valid"
                ? score?.dimensions?.[name]
                : undefined;
            if (!d)
              return <p className="muted">No valid measurement available.</p>;
            const baseScore = entries[0].run.score;
            const base =
              evaluationState(baseScore) === "valid"
                ? baseScore?.dimensions?.[name]?.score
                : undefined;
            return (
              <div className="evaluation-dimension">
                <div>
                  <strong>{d.score} / 5</strong>
                  <span>
                    {Number.isFinite(d.weight)
                      ? `Weight ${Math.round(d.weight * 100)}%`
                      : ""}
                    {i > 0 && Number.isFinite(base)
                      ? ` · Δ ${(d.score - base).toFixed(2)}`
                      : ""}
                  </span>
                </div>
                <div className="dimension-track">
                  <i style={{ width: `${(d.score / 5) * 100}%` }} />
                </div>
                <TextValue value={d.note} />
              </div>
            );
          }}
        </AlignedSection>
      ))}
      <AlignedSection title="Usability thresholds" entries={entries}>
        {(entry) => (
          <p className="muted">
            Overall ≥ {entry.run.score?.thresholds?.usable_overall_min ?? "—"} ·
            fidelity ≥ {entry.run.score?.thresholds?.usable_fidelity_min ?? "—"}
          </p>
        )}
      </AlignedSection>
      <ul className="explanation-list">
        <li>
          Assessments and explanations come from the provider report imported
          with this execution.
        </li>
        <li>Score differences use valid reports from both experiments.</li>
      </ul>
    </>
  );
}
