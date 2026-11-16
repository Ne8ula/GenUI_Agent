/// <reference types="vite/client" />
import { useEffect, useRef } from 'react';
import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createAstralConversation } from './conversation.ts';
import { createDataLayer } from './data-layer.ts';
import { createAstralEye } from './eye.ts';
import { START_POSITION, arrivalPath, createFlight, holdingGlide, type Vec3 } from './flight.ts';
import { createGlow } from './glow.ts';
import { createInspectMarks } from './inspect-marks.ts';
import { INSPECT_NONE, nextInspect } from './inspect.ts';
import { hasLook } from './looks.ts';
import { LIGHTING_START, createPointField, createTunnelCloud, nextLighting } from './point-field.ts';
import { generateRoomCloud } from './room-generation.ts';
import { loadRecordedRoomCloud } from './room-source.ts';
import { createSplatView, type SplatView } from './splat-view.ts';
import { createWater, type AstralWater } from './water.ts';
import { ASTRAL_EFFECTS, TUNNEL, type AstralConversation, type AstralLight, type AstralPhase, type PointCloud, type RoomHero } from './types.ts';
import './astral.css';

const TUNNEL_FORM_SECONDS = 6;
const TUNNEL_HOLD_Z = 14; // the glide approaches this point, well short of the room, and never reaches it
const TUNNEL_MIN_SECONDS = 8; // even a fast room waits until the tunnel has fully formed
const REHEARSAL_MIN_SECONDS = 12; // long enough to judge the tunnel
const ARRIVAL_SECONDS = 12; // flight from the tunnel to the room's viewpoint; matches point-field's arrival, which releases the spiral as the viewer passes it
const DISSOLVE_SECONDS = 3.5;
const UNAVAILABLE_SECONDS = 5;
const HORIZONTAL_FOV = 90; // degrees; keeps an ultrawide view from stretching at the edges
const MAX_RENDER_PIXELS = 8_300_000; // ~4K; the LED wall gains nothing from more for a point field
const LIGHT_KEYS: Partial<Record<string, AstralLight>> = {
  Digit8: 'liminal', Numpad8: 'liminal', Digit9: 'afternoon', Numpad9: 'afternoon', Digit0: 'night', Numpad0: 'night', Minus: 'dark', NumpadSubtract: 'dark',
};

/** Slow start, long settle. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

type Stage = 'void' | 'tunnel' | 'arriving' | 'room' | 'dissolving';

// Development only: ?eye=listening (or idle, thinking, speaking, unavailable) forces the eye's phase, to judge each look without the voice services.
const DEV_EYE_PHASES: readonly AstralPhase[] = ['idle', 'listening', 'thinking', 'speaking', 'unavailable'];
const devEyeParam = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('eye') : null;
const devEyePhase = DEV_EYE_PHASES.find(phase => phase === devEyeParam) ?? null;
// Development only: ?splats=standin gives a room without a splat file stand-in splats made from its own points, to judge the swap.
const devStandInSplats = import.meta.env.DEV && new URLSearchParams(window.location.search).get('splats') === 'standin';

export default function AstralRoom() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 1);
    const canvas = renderer.domElement;
    canvas.className = 'astral-canvas';
    host.append(canvas);

    const scene = new Scene();
    const camera = new PerspectiveCamera(60, 1, 0.03, 200);
    const flight = createFlight(camera, canvas);
    const eye = createAstralEye();
    const field = createPointField();
    scene.add(field.object, eye.object);
    const glow = createGlow(renderer, scene, camera);
    // Prototype look (?look=data); off, nothing below changes.
    const data = hasLook('data') ? createDataLayer(host) : null;
    // Look and it answers: the room's heroes, which one the viewer is inspecting, and its marks (always on, any look).
    const marks = createInspectMarks(host);
    let heroes: RoomHero[] = [];
    let inspect = INSPECT_NONE;
    const viewDirection = new Vector3();
    // What the data layer may show about the cloud on screen: its real count, and whether the room has a lamp at all.
    let cloudCount: number | null = null;
    let roomLamps: number | null = null;

    let time = 0;
    let stage: Stage = 'void';
    let stageAt = 0;
    let formationFrom = 0;
    let phase: AstralPhase = 'idle';
    let conversationFailed = false;
    let unavailableUntil = 0;
    let generation: AbortController | undefined;
    let pendingRoom: { cloud: PointCloud; notBefore: number } | undefined;
    let arrival: { from: Vec3; velocity: Vec3; to: Vec3; lookFrom: Vec3; lookTo: Vec3 } | undefined;

    const enterStage = (next: Stage) => { stage = next; stageAt = time; };
    // A mirror of the field's lighting, so the L key knows which way to switch the lamp.
    let lighting = LIGHTING_START;
    const setLight = (light: AstralLight) => { lighting = nextLighting(lighting, light); field.setLighting(light); };
    // The room's splat paint, when it has one; loaded in the background as the room arrives.
    let splatView: SplatView | null = null;
    const dropSplats = () => { splatView?.dispose(); splatView = null; glow.setSceneDraw(null); };
    // The room's pool, when it has one: one simulation, drawn as points and as splats (water.ts).
    let water: AstralWater | null = null;
    const dropWater = () => { if (water) { scene.remove(water.points); water.splats.removeFromParent(); water.dispose(); water = null; } };
    const showRoom = (cloud: PointCloud) => {
      dropWater();
      if (cloud.water) {
        water = createWater(cloud.water, cloud.lights);
        // a lit room's settled grains are opaque and depth-tested (point-field.ts): the water's grains join them in the depth buffer
        water.setPointDepth(cloud.lit === true);
        scene.add(water.points);
      }
      lighting = LIGHTING_START;
      dropSplats();
      field.setCloud(cloud);
      cloudCount = cloud.count;
      roomLamps = cloud.lights?.lamps.length ?? 0;
      heroes = cloud.heroes ?? [];
      inspect = INSPECT_NONE;
      const source = cloud.splats ? { url: cloud.splats } : devStandInSplats ? { standIn: cloud } : null;
      if (source) splatView = createSplatView({ renderer, camera, scene, overlay: eye.object, source, water: cloud.water });
      if (water && splatView) splatView.paint.add(water.splats);
    };
    /** Swap the points for the painted room (true) or back (false). Quietly does nothing until the paint has loaded. */
    const showPaint = (painted: boolean) => {
      if (stage !== 'room' || !splatView?.show(painted)) console.info('[astral] the painted room is not ready; nothing changes.');
    };

    const startTunnel = () => {
      dropSplats();
      dropWater();
      field.setFormation(0);
      const tunnel = createTunnelCloud();
      field.setCloud(tunnel);
      cloudCount = tunnel.count;
      roomLamps = null;
      heroes = [];
      inspect = INSPECT_NONE;
      field.setEffect('calm', 0); // the tunnel spirals by itself; vortex on top smears it
      flight.enabled = false;
      flight.guide({ position: [0, TUNNEL.axisY, TUNNEL.length], lookAt: [0, TUNNEL.axisY, 0] }, true);
      enterStage('tunnel');
    };

    const dissolveTunnel = (unavailable: boolean) => {
      pendingRoom = undefined;
      formationFrom = 1;
      if (unavailable) unavailableUntil = time + UNAVAILABLE_SECONDS;
      enterStage('dissolving');
    };

    /** One generation at a time: a newer request aborts the older. */
    const requestRoom = (source: (signal: AbortSignal) => Promise<PointCloud>, minimumTunnel: number) => {
      generation?.abort();
      const request = new AbortController();
      generation = request;
      if (stage === 'void' || stage === 'dissolving') startTunnel();
      source(request.signal).then(
        cloud => {
          if (request.signal.aborted) return;
          generation = undefined;
          if (stage === 'tunnel') pendingRoom = { cloud, notBefore: stageAt + minimumTunnel };
          else showRoom(cloud); // EVA re-dreams the room the viewer is already in
        },
        error => {
          if (request.signal.aborted) return;
          generation = undefined;
          console.error('[astral] room generation failed', error);
          if (stage === 'tunnel') dissolveTunnel(true);
        },
      );
    };

    const stopGeneration = () => {
      generation?.abort();
      generation = undefined;
      if (stage === 'tunnel') dissolveTunnel(false);
    };

    let conversation: AstralConversation | undefined;
    try {
      conversation = createAstralConversation({
        onPhase: next => { phase = next; },
        onDecision: d => { field.setEffect(d.effect, d.intensity); setLight(d.light); },
        onReply: reply => {
          if (!(reply.room && stage === 'void')) field.setEffect(reply.effect, reply.intensity);
          setLight(reply.light);
          if (reply.room) requestRoom(signal => generateRoomCloud(reply.room!, renderer, signal), TUNNEL_MIN_SECONDS);
        },
        onVoiceLevel: level => { field.setVoice(level); eye.setVoice(level); },
      });
    } catch (error) {
      console.error('[astral] voice loop could not start', error);
      conversationFailed = true;
    }

    const resize = () => {
      const width = host.clientWidth, height = host.clientHeight;
      // ?px=1 lowers the render scale for a slower machine driving a big screen (a laptop projecting to the LED wall).
      const pixelCap = Number(new URLSearchParams(location.search).get('px')) || 1.5;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, Math.max(0.5, Math.min(2, pixelCap)), Math.sqrt(MAX_RENDER_PIXELS / (width * height))));
      renderer.setSize(width, height);
      camera.aspect = width / height;
      const verticalFov = 2 * Math.atan(Math.tan((HORIZONTAL_FOV * Math.PI) / 360) / camera.aspect);
      camera.fov = Math.min(60, (verticalFov * 180) / Math.PI);
      camera.updateProjectionMatrix();
      glow?.setSize(width, height, renderer.getPixelRatio());
      data?.resize();
      marks.resize();
    };
    resize();
    window.addEventListener('resize', resize);

    const requestLock = () => {
      if (document.pointerLockElement === canvas) return;
      try {
        void Promise.resolve(canvas.requestPointerLock()).catch(() => {});
      } catch { /* refused outside a gesture or during the browser's cool-down; the next gesture retries */ }
    };
    let talking = false;
    const stopAll = () => {
      talking = false;
      conversation?.stop();
      stopGeneration();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        stopAll();
        document.exitPointerLock();
        return;
      }
      requestLock();
      if (event.repeat) return;
      if (event.code === 'KeyT') {
        talking = true;
        conversation?.startListening();
      }
      if (event.code === 'KeyR') {
        console.info('[astral] rehearsal: arriving in the RECORDED room fixture; this is not live generation.');
        requestRoom(signal => loadRecordedRoomCloud(renderer, signal), REHEARSAL_MIN_SECONDS);
      }
      const digit = /^(?:Digit|Numpad)([1-7])$/.exec(event.code);
      if (digit) field.setEffect(ASTRAL_EFFECTS[Number(digit[1]) - 1]!, 1);
      // Rehearsal lighting, to judge it without the voice services: 8 liminal, 9 afternoon, 0 night, Minus dark, L the lamp.
      const light = LIGHT_KEYS[event.code];
      if (light) setLight(light);
      if (event.code === 'KeyL') setLight(lighting.lamp ? 'lamp_off' : 'lamp_on');
      // Rehearsal: P swaps the points and the painted room.
      if (event.code === 'KeyP') showPaint(!splatView?.painted);
    };
    const finishTalking = () => {
      if (!talking) return;
      talking = false;
      conversation?.finishListening();
    };
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === 'KeyT') finishTalking(); };
    // Chrome swallows the Escape that ends pointer lock, so losing the lock is itself the stop control.
    const onLockChange = () => { if (document.pointerLockElement !== canvas) stopAll(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', finishTalking);
    host.addEventListener('pointerdown', requestLock);
    document.addEventListener('pointerlockchange', onLockChange);

    const start = performance.now();
    let previous = start;
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      time = (now - start) / 1000;
      const frameMs = now - previous;
      const dt = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      const elapsed = time - stageAt;

      if (stage === 'tunnel') {
        field.setFormation(ease(clamp01(elapsed / TUNNEL_FORM_SECONDS)));
        const z = TUNNEL.length - holdingGlide(TUNNEL.length - TUNNEL_HOLD_Z, elapsed);
        // A slow sway off the axis, as if carried rather than driven.
        const position: Vec3 = [Math.sin(elapsed * 0.13) * 0.35, TUNNEL.axisY + Math.sin(elapsed * 0.09 + 1) * 0.12, z];
        flight.guide({ position, lookAt: [Math.sin(elapsed * 0.13 + 0.8) * 0.5, TUNNEL.axisY, z - 12] });
        if (pendingRoom && time >= pendingRoom.notBefore) {
          const room = pendingRoom.cloud;
          pendingRoom = undefined;
          showRoom(room);
          field.setEffect('calm', 1);
          const to = room.arrival?.position ?? [...START_POSITION];
          const lookTo = room.arrival?.lookAt ?? [to[0], to[1], to[2] - 6];
          arrival = { from: [...flight.state.position], velocity: [...flight.state.velocity], to, lookFrom: [position[0], position[1], z - 12], lookTo };
          enterStage('arriving');
        }
      } else if (stage === 'arriving' && arrival) {
        const s = clamp01(elapsed / ARRIVAL_SECONDS);
        const turn = ease(s);
        const position = arrivalPath(arrival.from, arrival.velocity, arrival.to, ARRIVAL_SECONDS, elapsed);
        const lookAt = [0, 1, 2].map(axis => arrival!.lookFrom[axis]! + (arrival!.lookTo[axis]! - arrival!.lookFrom[axis]!) * turn) as Vec3;
        flight.guide({ position, lookAt });
        if (s >= 1) {
          flight.guide(null);
          flight.enabled = true;
          arrival = undefined;
          enterStage('room');
        }
      } else if (stage === 'dissolving') {
        const s = clamp01(elapsed / DISSOLVE_SECONDS);
        field.setFormation(formationFrom * (1 - ease(s)));
        if (s >= 1) {
          // Left adrift where the tunnel was; the void has no room to fly in.
          flight.guide(null);
          enterStage('void');
        }
      }

      const eyePhase = devEyePhase ?? (conversationFailed || time < unavailableUntil ? 'unavailable' : phase);
      eye.setPhase(eyePhase);
      eye.setStage(stage === 'dissolving' ? 'void' : stage);
      flight.update(time, dt);
      eye.update(time, dt, camera);
      field.setEyeLight(eye.object.position, eye.glow);
      // the pool's points are in the points layer, its splats in the paint (splat-view's layers); one simulation moves both
      water?.update(time, dt, camera.position, eye.object.position, eye.glow, lighting.mood);
      // only in the room, in free flight: the centre ray and the viewer's place pick the hero (inspect.ts)
      camera.getWorldDirection(viewDirection);
      const p = camera.position;
      inspect = stage === 'room' && flight.enabled
        ? nextInspect(inspect, heroes, [p.x, p.y, p.z], [viewDirection.x, viewDirection.y, viewDirection.z], time) : INSPECT_NONE;
      field.setInspect(inspect.hero);
      field.update(time, dt, camera);
      splatView?.update(dt);
      glow.setSceneDraw(splatView?.active ? splatView.drawLayers : null);
      glow.render();
      marks.update(heroes[inspect.hero] ?? null, camera, dt);
      if (data) {
        const e = eye.object.position, inRoom = stage === 'arriving' || stage === 'room';
        data.update({
          frameMs, stage,
          viewer: { x: camera.position.x, y: camera.position.y, z: camera.position.z, dirX: viewDirection.x, dirZ: viewDirection.z },
          eye: { x: e.x, y: e.y, z: e.z, glow: eye.glow, phase: eyePhase },
          axisZ: stage === 'tunnel' || stage === 'arriving' ? camera.position.z : null,
          lighting: inRoom ? { mood: lighting.mood, lamp: roomLamps ? lighting.lamp : null } : null,
          points: cloudCount,
        });
      }
    });

    return () => {
      generation?.abort();
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', finishTalking);
      host.removeEventListener('pointerdown', requestLock);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      conversation?.dispose();
      flight.dispose();
      scene.remove(field.object, eye.object);
      field.dispose();
      eye.dispose();
      splatView?.dispose();
      dropWater();
      glow?.dispose();
      data?.dispose();
      marks.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return <div className="astral" ref={hostRef} />;
}
