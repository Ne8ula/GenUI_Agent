import type {
  CssHitRegion,
  DismissAck,
  E1NativeBridge,
  E1RuntimeInfo,
  HitRegionAck,
  HitRegionUpdate,
  MaterialScene,
  MaterialSceneAck,
  MaterialSceneInput,
  MaterialStatus,
  MaterialStatusAck,
  Unlisten,
  WorkAreaMetadata,
} from "./types";

const COMMANDS = Object.freeze({
  beginInteractiveSession: "e1_get_work_area",
  publishHitRegions: "e1_publish_hit_regions",
  syncMaterialScene: "e1_sync_material_scene",
  latestMaterialScene: "e1_get_latest_material_scene",
  reportMaterialStatus: "e1_report_material_status",
  latestMaterialStatus: "e1_get_latest_material_status",
  dismiss: "e1_dismiss_overlay",
});

const EVENTS = Object.freeze({
  materialScene: "eva-e1://material-scene",
  materialStatus: "eva-e1://material-status",
});

export interface ElementHitRegionSource {
  readonly id: string;
  readonly element: Element | null;
}

function browserUnlisten(): Unlisten {
  return () => undefined;
}

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function getE1RuntimeInfo(): E1RuntimeInfo {
  if (!hasTauriRuntime()) return { native: false, layer: "browser" };
  const material = new URLSearchParams(window.location.search).get("layer") === "material";
  return { native: true, layer: material ? "material" : "interactive" };
}

/**
 * Reads only caller-supplied local DOM elements. It never inspects desktop pixels,
 * other applications, arbitrary points under the cursor, or the accessibility tree.
 */
export function collectElementHitRegions(
  sources: readonly ElementHitRegionSource[],
): readonly CssHitRegion[] {
  if (typeof window === "undefined") return [];

  const regions: CssHitRegion[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    if (regions.length >= 64 || seen.has(source.id)) continue;
    const element = source.element;
    if (!element?.isConnected) continue;
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.pointerEvents === "none"
    ) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (
      !Number.isFinite(rect.x) ||
      !Number.isFinite(rect.y) ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      continue;
    }
    seen.add(source.id);
    regions.push({
      id: source.id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }
  return regions;
}

export function createHitRegionUpdate(
  sequence: number,
  regions: readonly CssHitRegion[],
): HitRegionUpdate {
  const viewport =
    typeof window === "undefined"
      ? { widthCssPx: 1, heightCssPx: 1, devicePixelRatio: 1 }
      : {
          widthCssPx: Math.max(1, window.innerWidth),
          heightCssPx: Math.max(1, window.innerHeight),
          devicePixelRatio: window.devicePixelRatio || 1,
        };
  return {
    schemaVersion: "e1.hit-regions/1",
    sequence,
    viewport,
    regions: [...regions],
  };
}

class BrowserSafeE1NativeBridge implements E1NativeBridge {
  readonly runtime = getE1RuntimeInfo();

  private workAreaPromise: Promise<WorkAreaMetadata> | null = null;

  private async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }

  private async interactiveSession(): Promise<WorkAreaMetadata> {
    if (!this.runtime.native || this.runtime.layer !== "interactive") {
      throw new Error("E1 interactive native session is unavailable in this renderer");
    }
    if (this.workAreaPromise === null) {
      this.workAreaPromise = this.invoke<WorkAreaMetadata>(COMMANDS.beginInteractiveSession).catch(
        (error: unknown) => {
          this.workAreaPromise = null;
          throw error;
        },
      );
    }
    return this.workAreaPromise;
  }

  async getWorkArea(): Promise<WorkAreaMetadata | null> {
    if (!this.runtime.native || this.runtime.layer !== "interactive") return null;
    return this.interactiveSession();
  }

  async publishHitRegions(update: HitRegionUpdate): Promise<HitRegionAck | null> {
    if (!this.runtime.native) return null;
    const session = await this.interactiveSession();
    return this.invoke<HitRegionAck>(COMMANDS.publishHitRegions, {
      controllerSessionId: session.controllerSessionId,
      update,
    });
  }

  async syncMaterialScene(scene: MaterialSceneInput): Promise<MaterialSceneAck | null> {
    if (!this.runtime.native) return null;
    const session = await this.interactiveSession();
    return this.invoke<MaterialSceneAck>(COMMANDS.syncMaterialScene, {
      controllerSessionId: session.controllerSessionId,
      scene,
    });
  }

  async onMaterialScene(listener: (scene: MaterialScene) => void): Promise<Unlisten> {
    if (!this.runtime.native) return browserUnlisten();

    const { listen } = await import("@tauri-apps/api/event");
    let acceptedSession: string | null = null;
    let acceptedSequence = 0;
    let eventSeen = false;
    const retiredSessions = new Set<string>();
    const deliver = (scene: MaterialScene | null, source: "event" | "cache"): void => {
      if (!scene || retiredSessions.has(scene.controllerSessionId)) return;
      if (acceptedSession !== scene.controllerSessionId) {
        // The native host issues opaque sessions in epoch order. Never compare
        // their strings: a real event supersedes an in-flight older cache read,
        // and a superseded session is never allowed to become current again.
        if (source === "cache" && eventSeen) return;
        if (acceptedSession !== null) retiredSessions.add(acceptedSession);
        acceptedSession = scene.controllerSessionId;
        acceptedSequence = 0;
      }
      if (scene.sceneSequence <= acceptedSequence) return;
      acceptedSequence = scene.sceneSequence;
      listener(scene);
    };

    const unlisten = await listen<MaterialScene>(EVENTS.materialScene, (event) => {
      eventSeen = true;
      deliver(event.payload, "event");
    });
    try {
      // Listen first, then read the native cache. A concurrent event/cache pair is
      // ordered and deduplicated above, so the initial accepted scene cannot be lost.
      deliver(await this.invoke<MaterialScene | null>(COMMANDS.latestMaterialScene), "cache");
    } catch (error) {
      unlisten();
      throw error;
    }
    return unlisten;
  }

  async reportMaterialStatus(status: MaterialStatus): Promise<MaterialStatusAck | null> {
    if (!this.runtime.native) return null;
    return this.invoke<MaterialStatusAck>(COMMANDS.reportMaterialStatus, { status });
  }

  async onMaterialStatus(listener: (status: MaterialStatus) => void): Promise<Unlisten> {
    if (!this.runtime.native) return browserUnlisten();

    const session = await this.interactiveSession();
    const { listen } = await import("@tauri-apps/api/event");
    let acceptedSceneSequence = 0;
    let acceptedMonotonicMs = -1;
    const deliver = (status: MaterialStatus | null): void => {
      if (!status || status.controllerSessionId !== session.controllerSessionId) return;
      if (status.sceneSequence < acceptedSceneSequence) return;
      if (status.sceneSequence > acceptedSceneSequence) {
        acceptedSceneSequence = status.sceneSequence;
        acceptedMonotonicMs = -1;
      }
      if (status.monotonicMs <= acceptedMonotonicMs) return;
      acceptedMonotonicMs = status.monotonicMs;
      listener(status);
    };

    const unlisten = await listen<MaterialStatus>(EVENTS.materialStatus, (event) => {
      deliver(event.payload);
    });
    try {
      deliver(await this.invoke<MaterialStatus | null>(COMMANDS.latestMaterialStatus, {
        controllerSessionId: session.controllerSessionId,
      }));
    } catch (error) {
      unlisten();
      throw error;
    }
    return unlisten;
  }

  async dismiss(): Promise<DismissAck | null> {
    if (!this.runtime.native) return null;
    const session = await this.interactiveSession();
    return this.invoke<DismissAck>(COMMANDS.dismiss, {
      controllerSessionId: session.controllerSessionId,
    });
  }
}

export const e1NativeBridge: E1NativeBridge = new BrowserSafeE1NativeBridge();

export * from "./types";
