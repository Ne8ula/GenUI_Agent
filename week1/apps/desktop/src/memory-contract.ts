export const MEMORY_SOURCE = "fixtures/vault/preferences/weather-units.md";
export type DemoMemory = {
  id: "weather-units"; category: "preference"; value: "Celsius" | "Fahrenheit";
  scope: "weather"; source: "synthetic-demo"; recordedDate: string;
  markdown: string; sourceReference: typeof MEMORY_SOURCE;
};
const keys = ["id", "category", "value", "scope", "source", "recordedDate"];
const invalid = () => new Error("Demo memory unavailable");

export function parseDemoMemory(markdown: string): DemoMemory {
  if (new TextEncoder().encode(markdown).length > 4096 || markdown.includes("\0")) throw invalid();
  const lines = markdown.split(/\r?\n/);
  if (lines.shift() !== "---") throw invalid();
  const end = lines.indexOf("---");
  if (end < 0 || !lines.slice(end + 1).some(line => line.trim())) throw invalid();
  const fields: Record<string, string> = Object.create(null);
  for (const line of lines.slice(0, end)) {
    const separator = line.indexOf(": ");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 2);
    if (separator < 0 || !keys.includes(key) || Object.prototype.hasOwnProperty.call(fields, key) ||
        !value || value.trim() !== value) throw invalid();
    fields[key] = value;
  }
  const date = fields.recordedDate;
  if (Object.keys(fields).length !== keys.length || fields.id !== "weather-units" ||
      fields.category !== "preference" || !["Celsius", "Fahrenheit"].includes(fields.value) ||
      fields.scope !== "weather" || fields.source !== "synthetic-demo" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000") ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw invalid();
  return { id: "weather-units", category: "preference", value: fields.value as DemoMemory["value"],
    scope: "weather", source: "synthetic-demo", recordedDate: date, markdown, sourceReference: MEMORY_SOURCE };
}

// Reject unexpected fields and require returned metadata to agree with exact source.
export function validateDemoMemory(value: unknown): DemoMemory {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  if (typeof record.markdown !== "string") throw invalid();
  const parsed = parseDemoMemory(record.markdown);
  if (Object.keys(record).length !== Object.keys(parsed).length ||
      Object.entries(parsed).some(([key, field]) =>
        !Object.prototype.hasOwnProperty.call(record, key) || record[key] !== field)) throw invalid();
  return parsed;
}
