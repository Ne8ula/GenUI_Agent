export const POSES = ['stand', 'walk', 'reach', 'push', 'strike', 'fall', 'crouch', 'lie'] as const;
export type Pose = typeof POSES[number];
type ActorId = 'A' | 'B' | 'C';
type ObjectState = 'upright' | 'current' | 'displaced';
type Position3 = [number, number, number];

// The reconstruction payload is validated at the caller's trust boundary.
export type Scenario = {
  title: string;
  hypothetical: true;
  actors: { id: ActorId; label: string }[];
  steps: {
    t: number;
    actor: ActorId | null;
    pose: Pose;
    position: [number, number];
    facing: number;
    object_moves: { tag: number; state: ObjectState; position: Position3 }[];
    caption: string;
  }[];
};

export type Frame = {
  // Index in chronological (sorted) step order; -1 before the first step.
  step: number;
  // null elapsed selects a static representative pose for reduced motion.
  actors: { id: ActorId; pose: Pose; next: Pose; blend: number; elapsed: number | null; remaining: number; position: [number, number]; facing: number }[];
  objects: {
    tag: number;
    from: ObjectState;
    to: ObjectState;
    blend: number;
    // Only displaced uses model coordinates; null resolves to measured current or authored upright pose.
    fromPosition: Position3 | null;
    toPosition: Position3 | null;
  }[];
};

export function sortedSteps(s: Scenario) {
  return [...s.steps].sort((a, b) => a.t - b.t);
}

function progress(t: number, start: number, end: number) {
  if (t < start) return 0;
  const p = end <= start ? 1 : Math.max(0, Math.min(1, (t - start) / (end - start)));
  return p * p * (3 - 2 * p);
}

function sample(s: Scenario, steps: Scenario['steps'], t: number, step: number, interpolate: boolean): Frame {
  const frame: Frame = { step, actors: [], objects: [] };
  const completed = steps.slice(0, step + 1);
  for (const { id } of s.actors) {
    const history = completed.filter(candidate => candidate.actor === id);
    const previous = history.at(-1);
    if (!previous) continue;
    let start = history.length - 1;
    while (start > 0 && history[start - 1]!.pose === previous.pose) start--;
    const next = interpolate ? steps.slice(step + 1).find(candidate => candidate.actor === id) : undefined;
    const target = next ?? previous;
    const blend = next ? progress(t, previous.t, next.t) : 1;
    const angle = target.facing - previous.facing;
    const arc = Math.atan2(Math.sin(angle), Math.cos(angle));
    frame.actors.push({
      id,
      pose: previous.pose,
      next: target.pose,
      blend,
      elapsed: interpolate ? t - history[start]!.t : null,
      remaining: next ? next.t - t : 0,
      position: [
        previous.position[0] + (target.position[0] - previous.position[0]) * blend,
        previous.position[1] + (target.position[1] - previous.position[1]) * blend,
      ],
      facing: previous.facing + arc * blend,
    });
  }

  const tags = new Set(steps.flatMap(candidate => candidate.object_moves.map(move => move.tag)));
  const completedMoves = completed.flatMap(candidate => candidate.object_moves);
  for (const tag of tags) {
    const previous = completedMoves.findLast(move => move.tag === tag);
    // Object transitions span the preceding global step, not the preceding move of this tag.
    const nextStep = interpolate ? steps[step + 1] : undefined;
    const next = nextStep?.object_moves.findLast(move => move.tag === tag);
    const target = next ?? previous;
    frame.objects.push({
      tag,
      from: previous?.state ?? 'current',
      to: target?.state ?? 'current',
      blend: next && nextStep ? progress(t, steps[step]?.t ?? 0, nextStep.t) : 1,
      fromPosition: previous?.state === 'displaced' ? [...previous.position] : null,
      toPosition: target?.state === 'displaced' ? [...target.position] : null,
    });
  }
  return frame;
}

export function frameAt(s: Scenario, t: number): Frame {
  if (!Number.isFinite(t)) t = 0;
  const steps = sortedSteps(s);
  t = Math.min(t, steps.at(-1)?.t ?? 0);
  const step = steps.findLastIndex(candidate => candidate.t <= t);
  return sample(s, steps, t, step, true);
}

export function duration(s: Scenario): number {
  return Math.max(...s.steps.map(step => step.t));
}

export function steppedFrame(s: Scenario, index: number): Frame {
  if (!Number.isFinite(index)) index = 0;
  const steps = sortedSteps(s);
  const step = Math.max(0, Math.min(steps.length - 1, Math.trunc(index)));
  return sample(s, steps, steps[step]!.t, step, false);
}
