export type PerformanceSpan = {
  stage: string;
  name: string;
  window: number | null;
  seconds: number | null;
  reserved: number | null;
  allocated: number | null;
  startedAt?: number;
  endedAt?: number;
  modelId?: string;
  attempt?: number;
};
export type ResourceSample = {
  t: number;
  vram: number | null;
  ram: number | null;
  cpu: number | null;
  timestamp?: number;
};
export type HardwareData = {
  spans: PerformanceSpan[];
  samples: ResourceSample[];
  device?: DeviceSnapshot | null;
};
export type DeviceSnapshot = {
  recorded_at?: string;
  cuda_version?: string;
  devices: { name: string; total_memory_mib: number | null }[];
  host: {
    cpu_model?: string;
    cpu_count: number | null;
    ram_total_mib: number | null;
  };
};

export function timestamp(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}
export function timestampRange(
  start: unknown,
  end: unknown,
): { startedAt: number; endedAt: number } | {} {
  const a = timestamp(start),
    b = timestamp(end);
  return a !== null && b !== null && b >= a ? { startedAt: a, endedAt: b } : {};
}

// Empty measurements are unavailable, never zero. Keep the CSV's MiB and cores.
export function measurement(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// csv.DictWriter quotes commas, newlines and double quotes in video names.
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  text = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === "," || char === "\n") {
      row.push(cell);
      cell = "";
      closed = false;
      if (char === "\n") {
        rows.push(row);
        row = [];
      }
    } else if (char === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error("Invalid CSV quoting");
      cell += char;
    }
  }
  if (quoted) throw new Error("Unterminated CSV field");
  if (row.length || cell || closed) rows.push([...row, cell]);
  return rows.filter((r) => r.some((v) => v.trim()));
}

function table(text: string, required: string[]): Record<string, string>[] {
  const [headers, ...rows] = csvRows(text);
  if (!headers || required.some((h) => !headers.includes(h)))
    throw new Error(`Expected CSV columns: ${required.join(", ")}`);
  if (new Set(headers).size !== headers.length)
    throw new Error("Duplicate CSV columns");
  return rows.map((row) => {
    if (row.length !== headers.length)
      throw new Error("CSV row has an unexpected column count");
    return Object.fromEntries(headers.map((h, i) => [h, row[i]]));
  });
}

export function parsePerformanceCsv(
  text: string,
  identity: { experiment: string; video: string },
  warnings: string[],
): PerformanceSpan[] {
  const rows = table(text, ["experiment", "video", "stage", "span", "seconds"]);
  const spans: PerformanceSpan[] = [];
  let skipped = 0,
    missing = 0;
  for (const row of rows) {
    if (
      row.experiment !== identity.experiment ||
      row.video !== identity.video ||
      !row.stage.trim() ||
      !row.span.trim()
    ) {
      skipped++;
      continue;
    }
    const values = [
      row.seconds,
      row.vram_reserved_mib,
      row.vram_allocated_mib,
      row.window,
    ];
    const window = measurement(row.window);
    if (
      values.some((v) => v?.trim() && measurement(v) === null) ||
      (window !== null && (!Number.isInteger(window) || window < 1))
    )
      missing++;
    spans.push({
      ...timestampRange(row.started_at, row.ended_at),
      stage: row.stage,
      name: row.span,
      window:
        window !== null && Number.isInteger(window) && window >= 1
          ? window
          : null,
      seconds: measurement(row.seconds),
      reserved: measurement(row.vram_reserved_mib),
      allocated: measurement(row.vram_allocated_mib),
    });
    if (
      (row.started_at || row.ended_at) &&
      !("startedAt" in spans[spans.length - 1])
    )
      warnings.push(
        `Operation ${row.span}: invalid timestamp interval; duration remains available.`,
      );
  }
  if (skipped)
    warnings.push(
      `${skipped} performance row(s) skipped: video/experiment mismatch or missing operation.`,
    );
  if (missing)
    warnings.push(
      `${missing} performance row(s) contain invalid measurements; those values are unavailable.`,
    );
  return spans;
}

export function parseResourceCsv(
  text: string,
  warnings: string[],
): ResourceSample[] {
  // Older exports have only t_seconds and vram_device_mib.
  const rows = table(text, ["t_seconds", "vram_device_mib"]);
  const samples: ResourceSample[] = [],
    seen = new Set<number>();
  let skipped = 0,
    missing = 0;
  for (const row of rows) {
    const t = measurement(row.t_seconds);
    if (t === null || seen.has(t)) {
      skipped++;
      continue;
    }
    seen.add(t);
    if (
      [row.vram_device_mib, row.ram_mib, row.cpu_cores].some(
        (v) => v?.trim() && measurement(v) === null,
      )
    )
      missing++;
    samples.push({
      ...(timestamp(row.timestamp) !== null
        ? { timestamp: timestamp(row.timestamp)! }
        : {}),
      t,
      vram: measurement(row.vram_device_mib),
      ram: measurement(row.ram_mib),
      cpu: measurement(row.cpu_cores),
    });
    if (row.timestamp && timestamp(row.timestamp) === null)
      warnings.push(
        `Hardware sample at ${t}s: invalid timestamp; elapsed time remains available.`,
      );
  }
  if (skipped)
    warnings.push(
      `${skipped} hardware sample(s) skipped: invalid or duplicate elapsed time.`,
    );
  if (missing)
    warnings.push(
      `${missing} hardware sample(s) contain invalid measurements; those values are unavailable.`,
    );
  if (samples.some((s, i) => i > 0 && s.t < samples[i - 1].t))
    warnings.push("Hardware samples were reordered by elapsed time.");
  return samples.sort((a, b) => a.t - b.t);
}

export function peak(values: (number | null)[]): number | null {
  return values.reduce<number | null>(
    (max, value) => (value === null ? max : Math.max(max ?? 0, value)),
    null,
  );
}

export function nearestSample(
  samples: ResourceSample[],
  t: number,
): ResourceSample | undefined {
  if (!samples.length || t < samples[0].t || t > samples[samples.length - 1].t)
    return undefined;
  let low = 0,
    high = samples.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (samples[mid].t < t) low = mid + 1;
    else high = mid;
  }
  const sample =
    low && t - samples[low - 1].t <= samples[low].t - t
      ? samples[low - 1]
      : samples[low];
  return Math.abs(sample.t - t) <= 2.5 ? sample : undefined;
}

// Split at missing readings and gaps in the five-second sampling grid.
export function resourceSegments(
  samples: ResourceSample[],
  metric: "vram" | "ram" | "cpu",
): ResourceSample[][] {
  const segments: ResourceSample[][] = [];
  let segment: ResourceSample[] = [];
  for (const sample of samples) {
    if (
      sample[metric] === null ||
      (segment.length && sample.t - segment[segment.length - 1].t > 7.5)
    ) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (sample[metric] !== null) segment.push(sample);
  }
  if (segment.length) segments.push(segment);
  return segments;
}
