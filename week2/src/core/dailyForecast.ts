import dailyFixtureJson from "../../fixtures/w-nyc-02.daily.json";
import { validateDailyForecast } from "./generated/validators.js";
import { deepFreeze, safeJsonClone } from "./immutability";
import type { DailyForecast, ForecastDay } from "./types";

export { validateDailyForecast } from "./generated/validators.js";

function loadDailyForecast(index: 0 | 1): Readonly<DailyForecast> {
  const { records, schemaVersion: _schemaVersion, ...context } = dailyFixtureJson;
  const candidate = {
    ...context, schemaVersion: "e1.daily-forecast/1", ...records[index],
  };
  if (!validateDailyForecast(candidate)) throw new Error("Invalid bundled W-NYC-02 daily forecast");
  return deepFreeze(candidate) as Readonly<DailyForecast>;
}

export const DAILY_WEATHER_FIXTURE = deepFreeze({
  ...dailyFixtureJson,
  forecasts: { today: loadDailyForecast(0), tomorrow: loadDailyForecast(1) },
});

export function forecastForDay(day: ForecastDay): Readonly<DailyForecast> {
  if (day !== "today" && day !== "tomorrow") throw new Error("Unsupported forecast day");
  return DAILY_WEATHER_FIXTURE.forecasts[day];
}

/** Validate before using externally supplied daily data as either text or speech. */
export function parseDailyForecast(input: unknown): Readonly<DailyForecast> | null {
  const cloned = safeJsonClone(input);
  return cloned.ok && validateDailyForecast(cloned.value)
    ? deepFreeze(cloned.value) as Readonly<DailyForecast>
    : null;
}

export function formatForecastAnswer(forecast: Readonly<DailyForecast>): string {
  if (!validateDailyForecast(forecast)) throw new Error("Cannot narrate an unvalidated daily forecast");
  return `In this synthetic scenario, ${forecast.day} in ${forecast.location.label} is ${forecast.condition}, ${forecast.temperatureC} degrees Celsius.`;
}
