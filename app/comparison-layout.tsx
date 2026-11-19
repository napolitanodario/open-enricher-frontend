import { ReactNode } from "react";
import { Details, Run } from "@/lib/data";

export type ViewEntry = { run: Run; details: Details };
export function ComparisonColumns({
  entries,
  children,
  className = "",
}: {
  entries: ViewEntry[];
  children: (entry: ViewEntry, index: number) => ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`aligned-columns ${entries.length > 1 ? "is-comparing" : ""} ${className}`}
    >
      {entries.map((entry, i) => (
        <div
          className="aligned-cell"
          data-run={entry.run.id}
          data-column={i ? "B" : "A"}
          key={entry.run.id}
        >
          {children(entry, i)}
        </div>
      ))}
    </div>
  );
}
export function ColumnHeadings({ entries }: { entries: ViewEntry[] }) {
  if (entries.length < 2) return null;
  return (
    <ComparisonColumns entries={entries} className="comparison-headings">
      {(entry, i) => (
        <div className="column-label">
          {i ? "B" : "A"}
          <span>{entry.run.label}</span>
        </div>
      )}
    </ComparisonColumns>
  );
}
export function AlignedSection({
  title,
  eyebrow,
  description,
  entries,
  children,
  card = true,
  className = "",
  different = false,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  entries: ViewEntry[];
  children: (entry: ViewEntry, index: number) => ReactNode;
  card?: boolean;
  className?: string;
  different?: boolean;
}) {
  return (
    <section className={`aligned-section ${className}`} data-section={title}>
      <div className="shared-section-heading">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h3>
          {title}
          {different && <span className="field-difference">Differs</span>}
        </h3>
        {description && <p className="muted">{description}</p>}
      </div>
      <ComparisonColumns
        entries={entries}
        className={card ? "section-cards" : ""}
      >
        {children}
      </ComparisonColumns>
    </section>
  );
}
export function TextValue({
  value,
  empty = "Not provided",
}: {
  value: unknown;
  empty?: string;
}) {
  return (
    <p className="long-text">
      {typeof value === "string" && value ? value : empty}
    </p>
  );
}
function TagValues({
  value,
  other,
  column,
}: {
  value: unknown;
  other?: unknown;
  column: number;
}) {
  const otherTags = Array.isArray(other) ? new Set(other.map(String)) : null;
  return (
    <div className="tags">
      {Array.isArray(value) && value.length ? (
        value.map((v, i) => {
          const unique = otherTags && !otherTags.has(String(v));
          return (
            <span
              key={i}
              className={unique ? "unique-tag" : undefined}
              title={unique ? `Only in ${column ? "B" : "A"}` : undefined}
            >
              {String(v)}
            </span>
          );
        })
      ) : (
        <span className="muted">Not provided</span>
      )}
    </div>
  );
}

export function MetadataField({
  title,
  entries,
  values,
  tags = false,
  missing,
  className = "",
}: {
  title: string;
  entries: ViewEntry[];
  values: unknown[];
  tags?: boolean;
  missing?: ReactNode;
  className?: string;
}) {
  function displayValue(value: unknown) {
    if (tags)
      return JSON.stringify(
        Array.isArray(value) ? value.map(String).sort() : [],
      );
    return typeof value === "string" ? value : "";
  }
  return (
    <AlignedSection
      title={title}
      entries={entries}
      className={`metadata-field ${className}`}
      different={
        values.length === 2 &&
        displayValue(values[0]) !== displayValue(values[1])
      }
    >
      {(_, i) => {
        if (i >= values.length) return missing;
        return tags ? (
          <TagValues value={values[i]} other={values[1 - i]} column={i} />
        ) : (
          <TextValue value={values[i]} />
        );
      }}
    </AlignedSection>
  );
}
