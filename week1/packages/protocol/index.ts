import { validateWeather, validateDocument, validatePatch } from "./generated/validators.mjs";
export type Units = "Celsius" | "Fahrenheit";
export type ForecastDay = { date: string; condition: "clear" | "partly-cloudy" | "cloudy" | "rain"; highC: number | null; lowC: number | null; precipitationPct: number | null; windKph: number | null; windDirection: string | null };
export type WeatherFixture = { id: "weather-ithaca-week"; source: "synthetic"; location: string; timezone: string; days: ForecastDay[] };
export type UIDocument = { schemaVersion: "1.0"; revision: number; card: { id: "weather-primary"; type: "weather"; dataRef: "weather-ithaca-week"; showWind: boolean } };
export type WindPatch = { schemaVersion: "1.0"; kind: "set-wind"; cardId: "weather-primary"; baseRevision: number; showWind: boolean };
export function readWeather(value: unknown): WeatherFixture {
  if (!validateWeather(value)) throw new Error("Weather fixture unavailable");
  const fixture = value as WeatherFixture;
  let previous = 0;
  for (const day of fixture.days) {
    const timestamp = Date.parse(day.date + "T12:00:00Z");
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== day.date ||
      (previous && timestamp - previous !== 86400000) ||
      (day.highC !== null && day.lowC !== null && day.highC < day.lowC) ||
      ((day.windKph === null) !== (day.windDirection === null))) throw new Error("Weather fixture unavailable");
    previous = timestamp;
  }
  return fixture;
}
export function readDocument(value: unknown): UIDocument {
  if (!validateDocument(value)) throw new Error("Invalid UI document");
  return value as UIDocument;
}
export function initialDocument(): UIDocument {
  return readDocument({ schemaVersion: "1.0", revision: 0, card: { id: "weather-primary", type: "weather", dataRef: "weather-ithaca-week", showWind: false } });
}
export function windPatch(document: UIDocument, showWind = true): WindPatch {
  return { schemaVersion: "1.0", kind: "set-wind", cardId: document.card.id, baseRevision: document.revision, showWind };
}
export function applyPatch(document: UIDocument, candidate: unknown): { ok: boolean; document: UIDocument } {
  if (!validateDocument(document) || !validatePatch(candidate)) return { ok: false, document };
  const patch = candidate as WindPatch;
  if (patch.baseRevision !== document.revision || patch.cardId !== document.card.id ||
      patch.showWind === document.card.showWind) return { ok: false, document };
  const next = { ...document, revision: document.revision + 1, card: { ...document.card, showWind: patch.showWind } };
  if (!validateDocument(next)) return { ok: false, document };
  return { ok: true, document: next };
}
export type WorkspaceState = { document: UIDocument; position: { x: number; y: number }; undoWind: boolean | null };
export const createWorkspace = (): WorkspaceState => ({ document: initialDocument(), position: { x: 0, y: 0 }, undoWind: null });
export function revise(state: WorkspaceState, patch: unknown): WorkspaceState {
  const next = applyPatch(state.document, patch);
  return next.ok ? { ...state, document: next.document, undoWind: state.document.card.showWind } : state;
}
export function undo(state: WorkspaceState): WorkspaceState {
  if (state.undoWind === null) return state;
  const next = applyPatch(state.document, windPatch(state.document, state.undoWind));
  return next.ok ? { ...state, document: next.document, undoWind: null } : state;
}
export function reset(state: WorkspaceState): WorkspaceState {
  return { document: readDocument({ ...initialDocument(), revision: state.document.revision + 1 }), position: { x: 0, y: 0 }, undoWind: null };
}
export const temperature = (value: number | null, units: Units) => value === null ? "—" : String(Math.round(units === "Celsius" ? value : value * 9 / 5 + 32));

