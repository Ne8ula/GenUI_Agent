import { useEffect, useRef } from "react";
import type { AnchorState, ComparisonState, WeatherFixture, WeatherTimeId } from "../../core";
import { formatCloud, formatMeasurement, TIME_LABELS } from "../format";
import { HIT_REGION_ATTR } from "../regions";

interface ReadingLayerProps {
  fixture: WeatherFixture | null;
  selected: WeatherTimeId | null;
  comparison: ComparisonState | null;
  anchors: Readonly<Record<WeatherTimeId, AnchorState>>;
  /** Force the disclosure open (plain answer): "just the numbers" should not
   * require an extra click to see them. The user can still collapse it. */
  forceOpen: boolean;
}

/**
 * Host-owned, always-available reading order (DESIGN.md `reading-layer`).
 * Values persist in expressive, plain, reduced-motion, and renderer-failure
 * states because this never depends on the canvas/WebGL field. Collapsed by
 * default (owner refinement, 2026-09-23: the composition, not a table, is
 * the primary view) but never removed from the DOM — a keyboard/AT user can
 * always open it, and it is `hidden`-attribute collapsed, not visually
 * hidden-only, so a regression script can assert its open/closed state the
 * same way as any other native disclosure.
 */
export function ReadingLayer({ fixture, selected, comparison, anchors, forceOpen }: ReadingLayerProps) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (forceOpen && disclosure.current) disclosure.current.open = true;
  }, [forceOpen, Boolean(fixture)]);
  if (!fixture) {
    return (
      <section className="e1-reading" aria-label="Weather facts">
        <p className="e1-muted">No facts yet — request the weather to populate this reading list.</p>
      </section>
    );
  }

  return (
    <details
      className="e1-reading"
      ref={disclosure}
      {...{ [HIT_REGION_ATTR]: "reading-layer" }}
    >
      <summary aria-label="Full weather table, plain reading order">Full weather table</summary>
      <table className="e1-reading__table">
        <caption className="e1-reading__caption">
          {fixture.location.label} · {fixture.date} · {fixture.location.timezone} · as-of {fixture.asOfLocal}
          <br />Synthetic / {fixture.fixtureId} r{fixture.revision} / not live weather
        </caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Temperature</th>
            <th scope="col">Cloud</th>
            <th scope="col">Rain probability</th>
            <th scope="col">Wind</th>
          </tr>
        </thead>
        <tbody>
          {fixture.records.map((record) => {
            const anchor = anchors[record.id];
            const state: string[] = [];
            if (record.id === selected) state.push("Selected");
            if (comparison && (comparison.first === record.id || comparison.second === record.id)) {
              state.push("Compared");
            }
            if (anchor.pinned) state.push("Pinned");
            if (anchor.userMoved) state.push("Moved");
            return (
              <tr key={record.id}>
                <th scope="row" className="e1-mono">
                  {TIME_LABELS[record.id]} · {record.id}
                  <span className="e1-visually-hidden"> {state.join(", ")}</span>
                </th>
                <td className="e1-mono">{formatMeasurement(record.temperature)}</td>
                <td className="e1-mono">{formatCloud(record.cloudCover)}</td>
                <td className="e1-mono">{formatMeasurement(record.precipitationProbability)}</td>
                <td className="e1-mono">{formatMeasurement(record.wind)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
