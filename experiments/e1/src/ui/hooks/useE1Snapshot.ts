import { useSyncExternalStore } from "react";
import type { E1Controller, E1Snapshot } from "../../core";

/**
 * `getSnapshot()` returns the same frozen object reference until the
 * controller actually changes state, so `useSyncExternalStore` never forces
 * an unnecessary render.
 */
export function useE1Snapshot(controller: E1Controller): Readonly<E1Snapshot> {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
