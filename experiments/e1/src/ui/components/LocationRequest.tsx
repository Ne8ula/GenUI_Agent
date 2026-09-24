import { useEffect, useState } from "react";
import type { ControllerError, FixtureVariant, RequestStatus } from "../../core";
import { HIT_REGION_ATTR } from "../regions";

interface LocationRequestProps {
  status: RequestStatus;
  requestedLocation: string | null;
  fixtureVariant: FixtureVariant | null;
  error: ControllerError | null;
  onRequest: (location: string, variant: FixtureVariant) => void;
}

/**
 * Covers E1 step 1 (request), the missing-cloud repeat variant, and step 7
 * (correct the location to an unsupported place) with one explicit,
 * always-visible affordance — never a hidden test-only control, because the
 * spec treats location correction as an ordinary user act.
 */
export function LocationRequest({ status, requestedLocation, fixtureVariant, error, onRequest }: LocationRequestProps) {
  const [value, setValue] = useState(requestedLocation ?? "New York City");
  const [variant, setVariant] = useState<FixtureVariant>(fixtureVariant ?? "complete");

  useEffect(() => {
    if (requestedLocation !== null) setValue(requestedLocation);
  }, [requestedLocation]);

  return (
    <form
      className="e1-location"
      {...{ [HIT_REGION_ATTR]: "location-request" }}
      onSubmit={(event) => {
        event.preventDefault();
        onRequest(value.trim() || "New York City", variant);
      }}
    >
      <label className="e1-location__label" htmlFor="e1-location-input">
        Location
      </label>
      <input
        id="e1-location-input"
        className="e1-location__input e1-mono"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="New York City"
        aria-describedby={error ? "e1-location-error" : undefined}
      />
      <button type="submit" className="e1-btn e1-btn--protected">
        {status === "idle" || status === "dismissed" ? "Request weather" : "Request again"}
      </button>
      {/* Progressive disclosure: the fixture variant is a test/demo option,
          not part of the ordinary "ask for weather" act. */}
      <details className="e1-location__variant-disclosure">
        <summary>Fixture variant</summary>
        <fieldset className="e1-location__variant">
          <legend className="e1-visually-hidden">Fixture variant</legend>
          <label>
            <input
              type="radio"
              name="e1-variant"
              checked={variant === "complete"}
              onChange={() => setVariant("complete")}
            />
            Complete
          </label>
          <label>
            <input
              type="radio"
              name="e1-variant"
              checked={variant === "missing-cloud"}
              onChange={() => setVariant("missing-cloud")}
            />
            Missing cloud (test variant)
          </label>
        </fieldset>
      </details>
      {error ? (
        <p id="e1-location-error" className="e1-location__error" role="alert">
          {error.message}
        </p>
      ) : null}
    </form>
  );
}
