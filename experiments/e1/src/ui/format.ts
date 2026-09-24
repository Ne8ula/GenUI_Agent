import type { CloudMeasurement, Measurement, WeatherRecord, WeatherTimeId } from "../core/types";

/** Plain-language labels; never inferred, only the fixture's own labels/values. */
export const TIME_LABELS: Readonly<Record<WeatherTimeId, string>> = {
  "09:00": "Morning",
  "12:00": "Noon",
  "15:00": "Afternoon",
};

export function formatMeasurement(measurement: Measurement): string {
  return `${measurement.value}${measurement.unit === "%" ? "%" : ` ${measurement.unit}`}`;
}

export function formatCloud(cloud: CloudMeasurement): string {
  return cloud.status === "available" ? `${cloud.value}%` : "Not provided";
}

export function formatRecordRow(record: WeatherRecord): {
  time: string;
  temperature: string;
  cloud: string;
  precipitation: string;
  wind: string;
} {
  return {
    time: record.localTime,
    temperature: formatMeasurement(record.temperature),
    cloud: formatCloud(record.cloudCover),
    precipitation: formatMeasurement(record.precipitationProbability),
    wind: formatMeasurement(record.wind),
  };
}
