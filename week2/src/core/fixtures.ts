import completeFixtureJson from "../../fixtures/w-nyc-01.json";
import missingCloudFixtureJson from "../../fixtures/w-nyc-01.missing-cloud.json";
import { validateWeatherFixture } from "./generated/validators.js";
import { deepFreeze, safeJsonClone } from "./immutability";
import type {
  FixtureVariant,
  TrustedHostEnvelope,
  WeatherField,
  WeatherFixture,
  WeatherTimeId,
  WeatherUnit,
} from "./types";
import { E1_RESOURCE_BUDGET, TIME_IDS } from "./types";

function loadFixture(input: unknown, name: string): WeatherFixture {
  const cloned = safeJsonClone(input);
  if (!cloned.ok || !validateWeatherFixture(cloned.value)) {
    const details = validateWeatherFixture.errors
      ?.map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`)
      .join("; ");
    throw new Error(`Invalid bundled fixture ${name}: ${cloned.message ?? details ?? "unknown error"}`);
  }
  return deepFreeze(cloned.value as unknown as WeatherFixture) as WeatherFixture;
}

export const COMPLETE_WEATHER_FIXTURE = loadFixture(completeFixtureJson, "w-nyc-01.json");
export const MISSING_CLOUD_WEATHER_FIXTURE = loadFixture(
  missingCloudFixtureJson,
  "w-nyc-01.missing-cloud.json",
);

export const TRUSTED_HOST_ENVELOPE: TrustedHostEnvelope = deepFreeze({
  sourceKind: "synthetic",
  evidenceStatus: "shape-and-semantics-validated",
  confidentiality: "public",
  fixtureId: "W-NYC-01",
  fixtureRevision: 1,
  seed: "W-NYC-01-r1-seed-20261014",
  budget: E1_RESOURCE_BUDGET,
}) as TrustedHostEnvelope;

export function fixtureForVariant(variant: FixtureVariant): WeatherFixture {
  return variant === "missing-cloud" ? MISSING_CLOUD_WEATHER_FIXTURE : COMPLETE_WEATHER_FIXTURE;
}

export function isWeatherTimeId(value: unknown): value is WeatherTimeId {
  return typeof value === "string" && TIME_IDS.includes(value as WeatherTimeId);
}

export function evidenceRef(time: WeatherTimeId, field: WeatherField): string {
  return `W-NYC-01:r1:${time}:${field}`;
}

export interface EvidenceBinding {
  ref: string;
  time: WeatherTimeId;
  field: WeatherField;
  unit: WeatherUnit;
  available: boolean;
}

const FIELD_UNITS: Readonly<Record<WeatherField, WeatherUnit>> = Object.freeze({
  temperature: "°C",
  cloudCover: "%",
  precipitationProbability: "%",
  wind: "km/h",
});

export function evidenceBindings(fixture: WeatherFixture): ReadonlyMap<string, EvidenceBinding> {
  const bindings = new Map<string, EvidenceBinding>();
  for (const record of fixture.records) {
    for (const field of Object.keys(FIELD_UNITS) as WeatherField[]) {
      const ref = evidenceRef(record.id, field);
      bindings.set(ref, {
        ref,
        time: record.id,
        field,
        unit: FIELD_UNITS[field],
        available: field !== "cloudCover" || record.cloudCover.status === "available",
      });
    }
  }
  return bindings;
}

export function recordAt(fixture: WeatherFixture, time: WeatherTimeId) {
  const record = fixture.records.find((candidate) => candidate.id === time);
  if (!record) throw new Error(`Bundled fixture is missing ${time}`);
  return record;
}
