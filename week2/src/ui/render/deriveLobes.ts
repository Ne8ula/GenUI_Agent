import { recordAt } from "../../core";
import type { E1Snapshot, WeatherTimeId } from "../../core";
import type { Lobe } from "./types";
import { anchorPixels } from "../anchorGeometry";

export interface DeriveLobesParams {
  snapshot: E1Snapshot;
  widthPx: number;
  heightPx: number;
  totalCount: number;
}

function otherComparedTime(snapshot: E1Snapshot): WeatherTimeId | null {
  const comparison = snapshot.comparison;
  if (!comparison) return null;
  return snapshot.selected === comparison.first ? comparison.second : comparison.first;
}

/**
 * Pure derivation: response score entities + selection/comparison/anchors +
 * stage size -> the lobes both renderer backends consume. `withdraw-and-reanchor`
 * and `part-and-relate` are the two authored, reviewable interpretations of a
 * comparison (DESIGN.md ss9, E1 spec "Two authored interpretations of Step 4").
 * This qualitative split is illustration, never a measured confidence value.
 */
export function deriveLobes({ snapshot, widthPx, heightPx, totalCount }: DeriveLobesParams): Lobe[] {
  if (snapshot.status !== "ready" || !snapshot.fixture) return [];

  // Plain answer is genuinely effect-free (DESIGN.md ss6, E1 spec step 6):
  // the reading layer and compact anchors carry every fact, scope, pin, and
  // comparison; the illustrative field itself renders nothing. This must
  // never be confused with a merely-instant (unanimated) field — an empty
  // lobe list, not a snapped-but-still-drawn one.
  if (snapshot.plain) return [];

  // Responsive, broad field: bounded by width more than height (the stage is
  // a wide architectural region, not a square card), so the field reads as
  // the dominant inhabited composition rather than a small decoration behind
  // a text panel.
  const baseRadius = Math.min(widthPx * 0.3, heightPx * 0.44);
  const primaryTime = snapshot.selected;
  const otherTime = otherComparedTime(snapshot);
  const primaryAnchor = snapshot.anchors[primaryTime];
  const primaryPx = anchorPixels(primaryAnchor, widthPx, heightPx);

  const record = recordAt(snapshot.fixture, primaryTime);
  const cloudCover = record.cloudCover;
  const cloudKnown = cloudCover.status === "available";
  const cloudFraction = cloudCover.status === "available" ? cloudCover.value / 100 : 0;
  const hasOcclusion = cloudKnown && cloudFraction > 0;
  // A missing reading is explicitly neither "clear" nor a guessed proportion:
  // give it a fixed, data-independent share so its visual weight cannot be
  // read as a quantitative cloud amount.
  const UNKNOWN_CLOUD_SHARE = 0.14;
  const unknownShare = cloudKnown ? 0 : UNKNOWN_CLOUD_SHARE;

  const occlusionShare = hasOcclusion ? 0.12 + 0.18 * cloudFraction : 0;
  const fieldShare = 1 - occlusionShare - unknownShare;

  const lobes: Lobe[] = [];

  if (otherTime) {
    const otherAnchor = snapshot.anchors[otherTime];
    const otherPx = anchorPixels(otherAnchor, widthPx, heightPx);
    // Deliberately amplified so the two authored recipes are clearly
    // reviewable side by side, not just numerically different: part-and-relate
    // keeps both lobes materially present and equal; withdraw-and-reanchor
    // reduces the un-selected lobe to a faint residue so the composition
    // reads as re-anchored around the newly attended time.
    const isWithdraw = snapshot.recipe === "withdraw-and-reanchor";
    const primaryPortion = isWithdraw ? 0.94 : 0.5;
    const otherPortion = 1 - primaryPortion;

    lobes.push({
      key: "field:primary",
      cx: primaryPx.x,
      cy: primaryPx.y,
      radius: baseRadius * (isWithdraw ? 1.15 : 0.85),
      count: Math.round(totalCount * fieldShare * primaryPortion),
      seed: `${snapshot.fixture.seed}:field:${primaryTime}`,
      tone: 0,
    });
    lobes.push({
      key: "field:secondary",
      cx: otherPx.x,
      cy: otherPx.y,
      radius: baseRadius * (isWithdraw ? 0.32 : 0.85),
      count: Math.round(totalCount * fieldShare * otherPortion),
      seed: `${snapshot.fixture.seed}:field:${otherTime}`,
      tone: 0,
    });
  } else {
    lobes.push({
      key: "field:primary",
      cx: primaryPx.x,
      cy: primaryPx.y,
      radius: baseRadius,
      count: Math.round(totalCount * fieldShare),
      seed: `${snapshot.fixture.seed}:field:${primaryTime}`,
      tone: 0,
    });
  }

  if (hasOcclusion) {
    lobes.push({
      key: "occlusion:primary",
      cx: primaryPx.x - baseRadius * 0.35,
      cy: primaryPx.y - baseRadius * 0.15,
      radius: baseRadius * (0.55 + 0.35 * cloudFraction),
      count: Math.round(totalCount * occlusionShare),
      seed: `${snapshot.fixture.seed}:occlusion:${primaryTime}`,
      tone: 1,
    });
  } else if (unknownShare > 0) {
    // Explicitly unbound neutral rendition (E1 spec "Repeat with the
    // missing-cloud variant"): a thin halo around the primary field, fixed
    // size regardless of any weather value, distinct in both shape (ring vs.
    // disk) and tone from a confirmed-clear reading (which simply omits an
    // occlusion lobe entirely).
    lobes.push({
      key: "occlusion:unknown",
      cx: primaryPx.x,
      cy: primaryPx.y,
      radius: baseRadius * 1.05,
      count: Math.round(totalCount * unknownShare),
      seed: `${snapshot.fixture.seed}:occlusion-unknown:${primaryTime}`,
      tone: 2,
      shape: "ring",
    });
  }

  return lobes;
}
