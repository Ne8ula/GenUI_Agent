import type { Camera, Object3D } from 'three';

// Shared contract of the astral room demo. Point-field look adapted from Gather 聚 / Wake 森 by DAO (be-of-dao.com).

/** A room as points. World frame of the recorded fixture: metres, y up, floor at y = 0. */
export interface PointCloud {
  count: number;
  /** xyz per point. */
  positions: Float32Array;
  /** sRGB rgb per point, 0..1. */
  colors: Float32Array;
  /** Unit surface normal per point, xyz, pointing out of the surface. Absent for the tunnel, which is lit by distance alone. */
  normals?: Float32Array;
  /** Typical distance between neighbouring points on a surface, metres. Rooms are sampled at even density, so one number describes it. */
  spacing?: number;
  /** True when the colours already contain the room's own lighting (a room rebuilt from pictures). The lighting system then leaves the default mood as it is and treats the other moods as changes to it, instead of lighting the points from scratch. */
  lit?: boolean;
  /** True when the points sit in ordered rows that follow each surface (the 'ordered' look), not at random. */
  ordered?: boolean;
  /** The room's own light sources, for the lighting system. Absent for the tunnel. */
  lights?: RoomLights;
  /** URL of a Gaussian-splat version of this room (SPZ) in the same world frame, when one exists. */
  splats?: string;
  /** A pool of water set into the floor. The room's own points and splats leave this volume empty; water.ts fills it. */
  water?: RoomWater;
  /** The room's hero objects, each as an axis-aligned box in the cloud's world frame; the points inside a box are that hero. */
  heroes?: RoomHero[];
  /** Where the viewer arrives. Absent for the tunnel. */
  arrival?: { position: [number, number, number]; lookAt: [number, number, number] };
  /** True when `arrival` is the camera of the one picture the room was rebuilt from: what lies outside its view is the machine's guess. */
  pictured?: boolean;
}

/** A pool: an ellipse in the floor (centre at the water's surface, radii along x and z, metres) with a basin `depth` metres deep below it. */
export interface RoomWater {
  center: [number, number, number];
  radius: [number, number];
  depth: number;
}

/** A hero object the viewer can inspect by looking at it. */
export interface RoomHero {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
  /** How many of the cloud's points fall inside the box; set by the room loader. */
  count?: number;
}

/** Positions of a room's light sources, in the cloud's world frame. Points near them are the fittings themselves. */
export interface RoomLights {
  /** Centre of each ceiling fitting. */
  ceiling: [number, number, number][];
  /** The bulb of each lamp object. */
  lamps: [number, number, number][];
}

/**
 * What EVA may do to the lighting in one turn. A model proposes one of these names as data.
 * liminal: the even, slightly sickly ceiling light (the default). afternoon: ceiling off, low warm light from one side.
 * night: ceiling off, dim and cool. dark: no lights at all, lamps included; only the eye glows.
 * lamp_on / lamp_off: the lamp objects alone. unchanged: leave the lighting as it is.
 */
export const ASTRAL_LIGHTS = ['unchanged', 'liminal', 'afternoon', 'night', 'dark', 'lamp_on', 'lamp_off'] as const;
export type AstralLight = typeof ASTRAL_LIGHTS[number];

/** Where the viewer is in the arrival: the eye behaves differently in each. */
export type EyeStage = 'void' | 'tunnel' | 'arriving' | 'room';

/** EVA's eye: red particles in the room's own space, always a recognisable square-pupilled eye. Implemented in eye.ts. */
export interface AstralEye {
  /** Add to the scene. object.position is where the eye is, which is also where its red light is. */
  readonly object: Object3D;
  /** How strongly the eye lights the room right now, 0..1. Never 0 while the microphone is live. */
  readonly glow: number;
  setPhase(phase: AstralPhase): void;
  setStage(stage: EyeStage): void;
  setVoice(level: number): void;
  update(time: number, dt: number, camera: Camera): void;
  dispose(): void;
}

/**
 * The arrival tunnel (a reconstruction of DAO's point-cloud walk): spiralling point clouds around a straight axis
 * x = 0, y = axisY, from the mouth at z = length (the viewer starts there, looking toward −z) to the room around the origin.
 * point-field.ts exports createTunnelCloud(): PointCloud; setCloud(room) after it materialises the room at the far end first.
 */
export const TUNNEL = { length: 60, axisY: 1.2 } as const;

/** What EVA may do to the room. A model proposes one of these names as data; it never supplies code. */
export const ASTRAL_EFFECTS = ['calm', 'breathe', 'melt', 'scatter', 'weightless', 'smear', 'vortex'] as const;
export type AstralEffect = typeof ASTRAL_EFFECTS[number];

export interface PointField {
  /** Add to the scene. */
  readonly object: Object3D;
  /** First call shows the cloud; later calls throw the points into the new cloud (Gather's kick transition). */
  setCloud(cloud: PointCloud): void;
  /** 0 = dispersed in the void, 1 = gathered into the room. The caller animates it. */
  setFormation(progress: number): void;
  /** Eases toward this effect; 'calm' or intensity 0 restores the room. Intensity 0..1. */
  setEffect(effect: AstralEffect, intensity: number): void;
  /** EVA's voice level 0..1; the field may pulse with it. */
  setVoice(level: number): void;
  /** Apply one lighting change; it eases in. 'unchanged' does nothing. A new room starts in 'liminal' with its lamps on. */
  setLighting(light: AstralLight): void;
  /** Which of the room's heroes (index into PointCloud.heroes) the viewer is inspecting, or -1 for none. It eases: that hero's points brighten and the rest of the room dims slightly. */
  setInspect(hero: number): void;
  /** Where the eye is and how strongly it glows (AstralEye.glow, 0..1): a moving red light on the points. Call every frame. */
  setEyeLight(position: { x: number; y: number; z: number }, glow: number): void;
  /** Once per frame. time and dt in seconds. */
  update(time: number, dt: number, camera: Camera): void;
  dispose(): void;
}

/** 'unavailable' = the paid routes are not enabled; nothing pretends otherwise. */
export type AstralPhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'unavailable';

/** Voice loop: microphone → transcript → EVA reply → spoken audio. Implemented in conversation.ts. */
export interface AstralConversation {
  /** Microphone on. */
  startListening(): void;
  /** Microphone off; request EVA's reply and speak it. */
  finishListening(): void;
  /** Stop everything at once: microphone, pending reply, audio. */
  stop(): void;
  dispose(): void;
}

export interface AstralConversationOptions {
  onPhase(phase: AstralPhase): void;
  /** Called when EVA starts speaking this reply. */
  onReply(reply: AstralReply): void;
  /** Fired as soon as the fast decision arrives, before the reply; absent or late decisions are not delivered. */
  onDecision?(decision: { effect: AstralEffect; intensity: number; light: AstralLight }): void;
  /** EVA's voice level 0..1 while speaking, 0 otherwise. */
  onVoiceLevel(level: number): void;
}

/** One validated EVA turn. */
export interface AstralReply {
  /** Spoken aloud. */
  reply: string;
  effect: AstralEffect;
  /** 0..1 */
  intensity: number;
  /** The lighting change the participant asked for, or 'unchanged'. */
  light: AstralLight;
  /** When EVA dreams a new room from the participant's words: a short plain description of it. Otherwise null. */
  room: string | null;
}

// room-generation.ts exports generateRoomCloud(description: string, renderer: WebGLRenderer, signal: AbortSignal): Promise<PointCloud>
// (live, paid: interpretation only; the points come from the procedural room's own unlit surfaces, not from a painted picture).
// room-source.ts's recorded room is a rehearsal fixture, never a substitute for it.
