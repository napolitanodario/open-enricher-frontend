/** React text nodes keep source content escaped; no HTML is injected. */
export function JsonCode({ text }: { text: string }) {
  let json = false;
  try {
    JSON.parse(text);
    json = true;
  } catch {}
  if (!json) return <pre className="source-code">{text}</pre>;
  const pattern =
    /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
  const tokens: React.ReactNode[] = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    tokens.push(text.slice(end, start));
    const value = match[0];
    const kind = value.startsWith('"')
      ? /^\s*:/.test(text.slice(start + value.length))
        ? "key"
        : "string"
      : /true|false/.test(value)
        ? "boolean"
        : value === "null"
          ? "null"
          : "number";
    tokens.push(
      <span key={start} className={`json-${kind}`}>
        {value}
      </span>,
    );
    end = start + value.length;
  }
  tokens.push(text.slice(end));
  return <pre className="source-code">{tokens}</pre>;
}
