import type { WeatherFixture } from "../../core";

interface HeaderProps {
  fixture: WeatherFixture | null;
}

/** Compact source affordance visible without hover, per DESIGN.md ss7. */
export function Header({ fixture }: HeaderProps) {
  return (
    <header className="e1-header">
      <p className="e1-header__wordmark e1-display">
        EVA <span className="e1-muted">/</span> E1
      </p>
      <p className="e1-header__source e1-mono e1-muted">
        {fixture ? (
          <>
            Source: {fixture.source.label} · {fixture.fixtureId} r{fixture.revision} · {fixture.location.label} ·{" "}
            {fixture.date} · {fixture.location.timezone} · as-of {fixture.asOfLocal} · units °C / % / km/h
          </>
        ) : (
          "No response requested yet — this response uses only the synthetic W-NYC-01 fixture."
        )}
      </p>
    </header>
  );
}
