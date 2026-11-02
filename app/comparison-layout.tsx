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
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  entries: ViewEntry[];
  children: (entry: ViewEntry, index: number) => ReactNode;
  card?: boolean;
  className?: string;
}) {
  return (
    <section className={`aligned-section ${className}`} data-section={title}>
      <div className="shared-section-heading">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h3>{title}</h3>
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
export function TagValues({ value }: { value: unknown }) {
  return (
    <div className="tags">
      {Array.isArray(value) && value.length ? (
        value.map((v, i) => <span key={i}>{String(v)}</span>)
      ) : (
        <span className="muted">Not provided</span>
      )}
    </div>
  );
}
