export const E1_RESPONSE_ID = "response:e1-weather" as const;

export type E1NativeLayer = "browser" | "interactive" | "material";
export type WeatherTimeId = "09:00" | "12:00" | "15:00";
export type MaterialRendererKind = "canvas2d" | "webgl";
export type MaterialSimulatedFailure =
  | "canvas-error"
  | "webgl-context-lost"
  | "webgl-unavailable"
  | null;

export interface E1RuntimeInfo {
  readonly native: boolean;
  readonly layer: E1NativeLayer;
}

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Size2D {
  readonly width: number;
  readonly height: number;
}

export interface WorkAreaMetadata {
  readonly schemaVersion: "e1.work-area/1";
  readonly platform: "windows";
  readonly interactiveWindowLabel: "main";
  readonly materialWindowLabel: "material";
  readonly originPhysicalPx: Point2D;
  readonly sizePhysicalPx: Size2D;
  readonly sizeCssPx: Size2D;
  readonly scaleFactor: number;
  readonly regionLimit: 64;
  readonly nativeRegionEnabled: true;
  /** Opaque per-WebView-load epoch established by the adapter. */
  readonly controllerSessionId: string;
  readonly nextHitRegionSequence: 1;
  readonly nextMaterialSceneSequence: 1;
}

export interface CssHitRegion {
  /** Stable developer-authored identifier; it carries no OS target or authority. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface HitRegionUpdate {
  readonly schemaVersion: "e1.hit-regions/1";
  /** Strictly increasing in the interactive renderer. */
  readonly sequence: number;
  readonly viewport: {
    readonly widthCssPx: number;
    readonly heightCssPx: number;
    readonly devicePixelRatio: number;
  };
  /** At most 64 rectangles. An empty list deliberately opens all desktop input. */
  readonly regions: readonly CssHitRegion[];
}

export interface HitRegionAck {
  readonly schemaVersion: "e1.hit-regions-ack/1";
  readonly sequence: number;
  readonly mode: "empty" | "bounded-regions";
  readonly appliedRegionCount: number;
  readonly clampedRegionCount: number;
  readonly inputPassThrough: boolean;
  readonly nativeScaleFactor: number;
}

export interface MaterialAnchor {
  readonly id: WeatherTimeId;
  /** Normalized work-area coordinates, bounded to [0, 1]. */
  readonly x: number;
  readonly y: number;
  readonly pinned: boolean;
  readonly userMoved: boolean;
}

export interface MaterialWeatherRecord {
  readonly id: WeatherTimeId;
  readonly temperatureC: number;
  readonly cloudCoverPercent: number | null;
  readonly precipitationProbabilityPercent: number;
  readonly windKmh: number;
}

export interface MaterialSceneInput {
  readonly schemaVersion: "e1.material-scene/1";
  /** Strictly increasing in the trusted interactive renderer. */
  readonly sceneSequence: number;
  readonly responseId: typeof E1_RESPONSE_ID;
  readonly revision: number;
  readonly generation: number;
  readonly fixtureId: "W-NYC-01" | null;
  readonly seed: "W-NYC-01-r1-seed-20261014" | null;
  readonly status: "idle" | "ready" | "unavailable" | "dismissed";
  readonly selected: WeatherTimeId;
  readonly comparison: {
    readonly first: WeatherTimeId;
    readonly second: WeatherTimeId;
  } | null;
  /** Exactly the three stable authored anchors. */
  readonly anchors: readonly MaterialAnchor[];
  /** Empty without a fixture; otherwise exactly the three authored fixture records. */
  readonly records: readonly MaterialWeatherRecord[];
  readonly recipe: "part-and-relate" | "withdraw-and-reanchor";
  readonly reducedMotion: boolean;
  readonly plain: boolean;
  readonly transition: {
    readonly id: string;
    readonly status: "idle" | "active" | "settled" | "interrupted" | "dismissed";
    readonly durationMs: number;
    readonly fromRevision: number;
    readonly toRevision: number;
  };
  readonly renderer: {
    readonly kind: MaterialRendererKind;
    /** Native validation permits 1..=8000; the ordinary authored load is 2000. */
    readonly requestedPointCount: number;
    readonly simulatedFailure: MaterialSimulatedFailure;
    readonly benchmark: {
      readonly runId: string | null;
      readonly active: boolean;
      readonly durationMs: number | null;
    };
  };
}

/** Native-delivered scene. The opaque session binds material replies to one controller load. */
export interface MaterialScene extends MaterialSceneInput {
  readonly controllerSessionId: string;
}

export interface MaterialRendererStats {
  readonly renderer: MaterialRendererKind;
  readonly drawCount: number;
  readonly pointCount: number;
  readonly requestedPointCount: number;
  readonly lastFrameMs: number;
  readonly framesRendered: number;
  readonly settled: boolean;
  readonly contextLost: boolean;
  readonly forcedContinuous: boolean;
  readonly benchmark: {
    readonly runId: string | null;
    readonly running: boolean;
    /** Bounded by native validation to 18,000 finite samples in [0, 10_000] ms. */
    readonly samplesMs: readonly number[];
  };
}

export type MaterialFailureCode =
  | "canvas-unavailable"
  | "webgl-unavailable"
  | "context-lost"
  | "render-error"
  | "benchmark-error";

export interface MaterialDiagnostic {
  readonly code: MaterialFailureCode;
  /** Plain, bounded diagnostic text; never HTML, code, a path, or an OS target. */
  readonly message: string;
}

interface MaterialStatusBase {
  readonly schemaVersion: "e1.material-status/1";
  readonly controllerSessionId: string;
  readonly sceneSequence: number;
  readonly responseId: typeof E1_RESPONSE_ID;
  readonly revision: number;
  readonly transitionId: string;
  /** Must strictly increase for reports about the same accepted scene. */
  readonly monotonicMs: number;
  readonly stats: MaterialRendererStats;
}

export type MaterialStatus =
  | (MaterialStatusBase & {
      readonly kind: "scene-applied" | "stats" | "transition-complete";
    })
  | (MaterialStatusBase & {
      readonly kind: "renderer-failure";
      readonly diagnostic: MaterialDiagnostic;
    });

export interface MaterialSceneAck {
  readonly schemaVersion: "e1.material-scene-ack/1";
  readonly controllerSessionId: string;
  readonly sceneSequence: number;
  readonly delivered: boolean;
}

export interface MaterialStatusAck {
  readonly schemaVersion: "e1.material-status-ack/1";
  readonly controllerSessionId: string;
  readonly sceneSequence: number;
  readonly delivered: boolean;
}

export interface DismissAck {
  readonly schemaVersion: "e1.dismiss-ack/1";
  readonly dismissed: true;
}

export type Unlisten = () => void;

export interface E1NativeBridge {
  readonly runtime: E1RuntimeInfo;
  getWorkArea(): Promise<WorkAreaMetadata | null>;
  publishHitRegions(update: HitRegionUpdate): Promise<HitRegionAck | null>;
  syncMaterialScene(scene: MaterialSceneInput): Promise<MaterialSceneAck | null>;
  onMaterialScene(listener: (scene: MaterialScene) => void): Promise<Unlisten>;
  reportMaterialStatus(status: MaterialStatus): Promise<MaterialStatusAck | null>;
  onMaterialStatus(listener: (status: MaterialStatus) => void): Promise<Unlisten>;
  dismiss(): Promise<DismissAck | null>;
}
