export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return value as Readonly<T>;
  }

  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}

export interface JsonCloneResult<T> {
  ok: boolean;
  value?: T;
  message?: string;
}

export function safeJsonClone<T>(input: T): JsonCloneResult<T> {
  const seen = new WeakSet<object>();
  let nodes = 0;

  const inspect = (value: unknown, depth: number): string | null => {
    nodes += 1;
    if (nodes > 1000) return "JSON value exceeds the 1,000-node limit";
    if (depth > 24) return "JSON value exceeds the depth limit";
    if (value === null || typeof value === "string" || typeof value === "boolean") return null;
    if (typeof value === "number") return Number.isFinite(value) ? null : "JSON numbers must be finite";
    if (typeof value !== "object") return `Unsupported JSON value type: ${typeof value}`;
    if (seen.has(value)) return "JSON value contains a cycle or repeated object reference";
    seen.add(value);

    if (Array.isArray(value)) {
      for (const child of value) {
        const issue = inspect(child, depth + 1);
        if (issue) return issue;
      }
      return null;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return "JSON objects must have a plain object prototype";
    }
    for (const child of Object.values(value as Record<string, unknown>)) {
      const issue = inspect(child, depth + 1);
      if (issue) return issue;
    }
    return null;
  };

  const message = inspect(input, 0);
  if (message) return { ok: false, message };

  try {
    return { ok: true, value: JSON.parse(JSON.stringify(input)) as T };
  } catch {
    return { ok: false, message: "Value could not be represented as JSON" };
  }
}

export function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
