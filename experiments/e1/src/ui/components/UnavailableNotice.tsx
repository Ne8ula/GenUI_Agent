import type { ControllerError } from "../../core";

interface UnavailableNoticeProps {
  error: ControllerError;
}

/**
 * Host-owned error presentation: explicit words, shape, and placement, never
 * color alone (DESIGN.md ss3). Never relabels a retained NYC fixture as the
 * unavailable place (E1 spec ss"Episode and interventions", step 7).
 */
export function UnavailableNotice({ error }: UnavailableNoticeProps) {
  return (
    <div className="e1-unavailable" role="alert">
      <p className="e1-unavailable__title">Unavailable</p>
      <p>{error.message}</p>
      {error.retainedFixtureId ? (
        <p className="e1-muted">
          Showing the retained prior answer for {error.retainedFixtureId} below. It was not changed or relabeled for
          &ldquo;{error.requestedLocation}&rdquo;.
        </p>
      ) : (
        <p className="e1-muted">No prior fixture is retained yet.</p>
      )}
    </div>
  );
}
