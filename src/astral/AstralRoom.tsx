/// <reference types="vite/client" />
import { useEffect, useRef } from 'react';
import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createDataLayer } from './data-layer.ts';
import { createAstralEye } from './eye.ts';
import { START_POSITION, arrivalPath, createFlight, holdingGlide, type Vec3 } from './flight.ts';
import { createGlow } from './glow.ts';
import { createInspectMarks } from './inspect-marks.ts';
import { INSPECT_NONE, nextInspect } from './inspect.ts';
import { hasLook } from './looks.ts';
import { createMenuView } from './menu-view.ts';
import { MENU_REFUSED, menuArrangement, menuDrag, menuOpen, menuStep, refusedPoints, type MenuPoints, type MenuRefused, type MenuState } from './menu.ts';
import { loadObjectPoints, loadShelf, replaceHero } from './object-points.ts';
import { LIGHTING_START, createPointField, createTunnelCloud, nextLighting } from './point-field.ts';
import { readReplacements, withReplacement, writeReplacements } from './replacements.ts';
import { loadRecordedRoomCloud } from './room-source.ts';
import { SWAP_PAIRINGS, SWAP_SECONDS, parseSwap, swapHero } from './sand-look.ts';
import { createSplatView, type SplatView } from './splat-view.ts';
import { REFUSALS, SIDE_TEASES, sideTeaseDue, speakPlaceholder } from './tease.ts';
import { createWater, type AstralWater } from './water.ts';
import { ASTRAL_EFFECTS, TUNNEL, type AstralLight, type AstralPhase, type PointCloud, type RoomHero } from './types.ts';
import { MOODS } from './grammar.ts';
import { MOOD_ROOM_POINTS, MOOD_ROOM_SIZE, chooseMood, chosenMood, moodRoom } from './mood-choice.ts';
import './astral.css';

const TUNNEL_FORM_SECONDS = 6;
const TUNNEL_HOLD_Z = 14; // the glide approaches this point, well short of the room, and never reaches it
const REHEARSAL_MIN_SECONDS = 12; // long enough to judge the tunnel
const ARRIVAL_SECONDS = 12; // flight from the tunnel to the room's viewpoint; matches point-field's arrival, which releases the spiral as the viewer passes it
const DISSOLVE_SECONDS = 3.5;
const UNAVAILABLE_SECONDS = 5;
const IDLE_SECONDS = 45; // in the room with no input: the visitor has gone, and the room returns to the void
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
// Development only: ?swap=<hero>,<pairing>,<progress> replaces that hero with the shelf's first object once the viewer has the room and
// holds the change (sand-look.ts) at that progress, for matching captures. It is not remembered.
const devSwap = import.meta.env.DEV ? parseSwap(window.location.search) : null;
/** A choice in the menu: an object of the shelf, or (no model) an entry EVA will not do. */
type Choice = { id: string; glb: string } | { id: MenuRefused; glb: null };

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
    const flight = createFlight(camera);
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
    // Replacing a hero: the room as it now is (object-points.ts makes the changed one), the menu of choices, and what EVA refused in it.
    const menuView = createMenuView(menuArrangement(window.location.search));
    scene.add(menuView.object);
    let room: PointCloud | null = null;
    let choices: Choice[] = [];
    let menu: MenuState | null = null;
    const refused = new Set<number>();
    const said: Partial<Record<keyof typeof REFUSALS, number>> = {};
    let changing = false, changeUntil = 0;   // an object is being fetched for a change; the change it started runs until then
    const leaving = new AbortController();   // the page is going: stop loading objects
    const viewDirection = new Vector3();
    // What the data layer may show about the cloud on screen: its real count, and whether the room has a lamp at all.
    let cloudCount: number | null = null;
    let roomLamps: number | null = null;

    let time = 0;
    let stage: Stage = 'void';
    let stageAt = 0;
    let formationFrom = 0;
    let phase: AstralPhase = 'idle';
    let unavailableUntil = 0;
    // The keyboard and mouse stand in for the controller and the camera: any input is a visitor being there,
    // and the mouse's place across the page is where they stand, side to side (-1 left edge, 1 right edge).
    let lastInput = -Infinity;
    let stopped = false; // Escape holds the start until the next key press
    let side = 0, sideLow = 0, sideHigh = 0;
    let lastTease = -Infinity, teases = 0;
    let swaps = 0; // replacements so far: each takes the next pairing, until the owner picks one
    let generation: AbortController | undefined;
    let pendingRoom: { cloud: PointCloud; notBefore: number } | undefined;
    let arrival: { from: Vec3; velocity: Vec3; to: Vec3; lookFrom: Vec3; lookTo: Vec3 } | undefined;

    const enterStage = (next: Stage) => { stage = next; stageAt = time; menu = null; };
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
      room = cloud;
      menu = null;
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
      room = null;
      cloudCount = tunnel.count;
      roomLamps = null;
      heroes = [];
      inspect = INSPECT_NONE;
      field.setEffect('calm', 0); // the tunnel spirals by itself; vortex on top smears it
      flight.enabled = false;
      flight.guide({ position: [0, TUNNEL.axisY, TUNNEL.length], lookAt: [0, TUNNEL.axisY, 0] }, true);
      enterStage('tunnel');
    };

    /** Disperses whatever is formed, the tunnel or the room, back into the void. */
    const dissolve = (unavailable: boolean) => {
      pendingRoom = undefined;
      // shortcut: the paint and the pool are cut at once while the points disperse, fade them if the cut shows.
      dropSplats();
      dropWater();
      flight.enabled = false;
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
          if (stage === 'tunnel') dissolve(true);
        },
      );
    };

    const stopGeneration = () => {
      generation?.abort();
      generation = undefined;
      if (stage === 'tunnel') dissolve(false);
    };

    // The shelf (object-points.ts): what a hero can be replaced with. Loaded once, in the background, each object's points fitted to
    // a unit box for its place in the menu; an object that will not load is left out. After them, the entries EVA will not do.
    let shelf: Promise<void> | undefined;
    const prepareShelf = () => (shelf ??= (async () => {
      const signal = leaving.signal, list: Choice[] = [], thumbs: MenuPoints[] = [];
      for (const { id, glb } of await loadShelf(signal)) {
        try { thumbs.push(await loadObjectPoints(glb, { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] }, signal, 1)); list.push({ id, glb }); }
        catch (error) { signal.throwIfAborted(); console.warn(`[astral] the shelf's "${id}" could not be loaded and is left out of the menu.`, error); }
      }
      for (const id of MENU_REFUSED) { list.push({ id, glb: null }); thumbs.push(refusedPoints(id)); }
      choices = list;
      menuView.setChoices(thumbs);
    })().catch(error => { if (!leaving.signal.aborted) console.error('[astral] the menu has nothing to offer', error); }));

    /** The recorded room, with what visitors replaced in it replaced again (replacements.ts). One that cannot be made again is skipped. */
    const loadRoom = async (signal: AbortSignal) => {
      let cloud = await loadRecordedRoomCloud(renderer, signal);
      const stored = readReplacements().filter(entry => cloud.heroes?.[entry.hero] && !holdsWater(cloud.heroes[entry.hero]!, cloud));
      if (!stored.length) return cloud;
      await prepareShelf();
      let made = 0;
      for (const { hero, object } of stored) {
        const glb = choices.find(choice => choice.id === object)?.glb;
        if (!glb) continue;
        try { cloud = replaceHero(cloud, hero, await loadObjectPoints(glb, cloud.heroes![hero]!, signal)); made++; }
        catch (error) { signal.throwIfAborted(); console.warn('[astral] a remembered replacement could not be made again.', error); }
      }
      console.info(`[astral] ${made} of ${stored.length} replacements remembered in this browser made again.`);
      return cloud;
    };
    const startRecorded = () => {
      console.info('[astral] arriving in the RECORDED room fixture; this is not live generation.');
      void prepareShelf();
      requestRoom(loadRoom, REHEARSAL_MIN_SECONDS);
    };
    // The void's choice (mood-choice.ts): while no room exists, three small rooms wait round the eye, one for each mood, drawn as the
    // menu's choices are; in the void `menu` is that choice. Each is its mood's base room, thinned and tinted with the mood's cast.
    // shortcut: all three are the recorded library, loaded once more for this, until each mood has its own base room (step 7).
    const moodView = createMenuView(menuArrangement(window.location.search), MOOD_ROOM_SIZE, MOOD_ROOM_POINTS);
    scene.add(moodView.object);
    const unrefused: ReadonlySet<number> = new Set();
    let moodsMade = false, moodsAsked = false;
    const makeMoods = () => {
      if (moodsAsked) return;
      moodsAsked = true;
      loadRecordedRoomCloud(renderer, leaving.signal).then(
        cloud => { moodView.setChoices(MOODS.map(mood => moodRoom(cloud, mood))); moodsMade = true; },
        error => { if (!leaving.signal.aborted) console.error('[astral] the three moods cannot be shown; no room can be chosen.', error); },
      );
    };
    const pickMood = () => {
      const mood = menu && MOODS[menu.index];
      if (!mood) return;
      chooseMood(mood);
      console.info(`[astral] mood chosen: "${mood}". Until step 7 every mood's room is the RECORDED library.`);
      startRecorded();
    };
    /** Any input: someone is there. From the void that alone starts the tunnel, if a room exists. Returns whether it did. */
    const present = () => {
      lastInput = time;
      if (stage !== 'void' || stopped || !chosenMood()) return false;
      startRecorded();
      return true;
    };
    const setSpeaking = (on: boolean) => {
      phase = on ? 'speaking' : 'idle';
      field.setVoice(on ? 1 : 0);
      eye.setVoice(on ? 1 : 0);
    };

    /** A hero the room's pool lies in. Its water is simulated apart from the points, so it cannot be replaced. */
    const holdsWater = (box: RoomHero, of: PointCloud | null = room) => {
      const centre = of?.water?.center;
      return !!centre && centre[0] >= box.min[0] && centre[0] <= box.max[0] && centre[2] >= box.min[2] && centre[2] <= box.max[2];
    };
    /** EVA will not: she says her next line for it, and nothing changes. */
    const refuse = (what: keyof typeof REFUSALS) => {
      const lines = REFUSALS[what], n = said[what] ?? 0;
      said[what] = n + 1;
      speakPlaceholder(lines[n % lines.length]!, setSpeaking);
    };
    /**
     * Hero `hero` becomes the shelf's object `id`: its points are fitted to the hero's box and exchanged for the hero's in the room's
     * cloud (object-points.ts), and the field shows the old object leaving and the new one arriving. `record`: remember it (replacements.ts).
     * Known gap: the painted room (P) still shows the old object.
     */
    const replace = async (hero: number, id: string, pairing: number, progress: number | null, record: boolean) => {
      const from = room, box = from?.heroes?.[hero], glb = choices.find(choice => choice.id === id)?.glb;
      if (!from || !box || !glb || changing || holdsWater(box)) return;
      changing = true;
      try {
        const object = await loadObjectPoints(glb, box, leaving.signal);
        if (room !== from || stage !== 'room') return;   // the room moved on while the object was being fetched
        const next = replaceHero(from, hero, object);
        if (!field.replaceHero(hero, next, pairing, progress)) return;
        room = next; heroes = next.heroes ?? []; cloudCount = next.count; changeUntil = time + SWAP_SECONDS;
        if (record) writeReplacements(withReplacement(readReplacements(), hero, id));
        console.info(`[astral] "${box.name}" replaced by "${id}" (${object.count} points; ${SWAP_PAIRINGS[pairing]?.name})${record ? ', remembered in this browser' : ', not remembered'}.`);
      } catch (error) {
        if (!leaving.signal.aborted) console.error('[astral] the replacement failed; the room is unchanged.', error);
      } finally { changing = false; }
    };
    /** The choices for the hero being inspected. Not during a change, nor over the painted room, which would not show one. */
    const openMenu = () => {
      const hero = heroes[inspect.hero];
      if (menu || !hero || stage !== 'room' || !flight.enabled || changing || time < changeUntil || splatView?.active) return;
      if (holdsWater(hero)) { refuse('pool'); return; }
      refused.clear();
      menu = menuOpen(inspect.hero, choices.length);
    };
    const pickMenu = () => {
      const choice = menu && choices[menu.index];
      if (!menu || !choice) return;
      if (choice.glb === null) { refused.add(menu.index); refuse(choice.id); return; }
      void replace(menu.hero, choice.id, swaps++ % SWAP_PAIRINGS.length, null, true);
      menu = null;
    };

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

    const stopAll = () => {
      stopped = true;
      globalThis.speechSynthesis?.cancel();
      stopGeneration();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (menu) {
        // The menu has the keys: A and D move between its choices, so the flight, which listens after this, must not see them.
        event.stopPropagation();
        lastInput = time;
        if (event.code === 'Escape') menu = null;
        else if (event.code === 'KeyA' || event.code === 'ArrowLeft') menu = menuStep(menu, -1);
        else if (event.code === 'KeyD' || event.code === 'ArrowRight') menu = menuStep(menu, 1);
        else if ((event.code === 'Enter' || event.code === 'KeyF') && !event.repeat) (stage === 'void' ? pickMood : pickMenu)();
        return;
      }
      if (event.code === 'Escape') {
        stopAll();
        return;
      }
      stopped = false;
      const started = present();
      if (event.repeat) return;
      // Rehearsal: R in a room throws its points into the recorded room again.
      if (event.code === 'KeyR' && !started) startRecorded();
      const digit = /^(?:Digit|Numpad)([1-7])$/.exec(event.code);
      if (digit) field.setEffect(ASTRAL_EFFECTS[Number(digit[1]) - 1]!, 1);
      // Lighting: 8 liminal, 9 afternoon, 0 night, Minus dark, L the lamp. These stand in for the controller's dial.
      const light = LIGHT_KEYS[event.code];
      if (light) setLight(light);
      if (event.code === 'KeyL') setLight(lighting.lamp ? 'lamp_off' : 'lamp_on');
      // Rehearsal: P swaps the points and the painted room.
      if (event.code === 'KeyP') showPaint(!splatView?.painted);
      // F, or a click: the choices for the hero being inspected.
      if (event.code === 'KeyF' && !started) openMenu();
      // Development only: G replaces a hero (the one being inspected, else the nearest) without the menu, by the next object and the
      // next pairing; it is not remembered. Backspace forgets every remembered replacement and returns to the recorded library.
      if (import.meta.env.DEV && event.code === 'KeyG' && stage === 'room') {
        const p = camera.position, objects = choices.filter(choice => choice.glb !== null);
        if (objects.length) void replace(swapHero(inspect.hero, heroes, [p.x, p.y, p.z]), objects[swaps % objects.length]!.id, swaps++ % SWAP_PAIRINGS.length, null, false);
      }
      if (import.meta.env.DEV && event.code === 'Backspace') {
        writeReplacements([]);
        if (!started) startRecorded();
      }
    };
    const onMouseMove = (event: MouseEvent) => {
      present();
      // choosing: the mouse moves between the choices and the view holds still
      if (menu) { menu = menuDrag(menu, event.movementX / host.clientWidth); return; }
      side = Math.max(-1, Math.min(1, (event.clientX / host.clientWidth) * 2 - 1));
      flight.setSide(side);
    };
    const onClick = () => {
      if (stage === 'void' && menu) { lastInput = time; pickMood(); return; }
      if (present() || stage !== 'room') return;
      if (menu) pickMenu(); else openMenu();
    };
    window.addEventListener('keydown', onKeyDown, true);   // in the capture phase, so the open menu can keep keys from the flight
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);

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
          if (devSwap) void prepareShelf().then(() => { const first = choices.find(choice => choice.glb !== null); if (first) return replace(devSwap.hero, first.id, devSwap.pairing, devSwap.progress, false); });
          sideLow = sideHigh = side;
          lastTease = -Infinity;
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

      if (stage === 'room') {
        sideLow = Math.min(sideLow, side);
        sideHigh = Math.max(sideHigh, side);
        if (time - Math.max(lastInput, stageAt) > IDLE_SECONDS) dissolve(false);
        else if (!menu && sideTeaseDue(time, { since: stageAt, lastInput, lastTease, travelled: sideHigh - sideLow })) {   // not while they are choosing
          lastTease = time;
          speakPlaceholder(SIDE_TEASES[teases++ % SIDE_TEASES.length]!, setSpeaking);
        }
      }

      // while the menu is open the eye comes in front of the viewer, as it does to think, and the choices are shown round it
      const eyePhase = devEyePhase ?? (time < unavailableUntil ? 'unavailable' : menu && stage === 'room' && phase === 'idle' ? 'thinking' : phase);
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
      // (the open menu keeps its hero, wherever the view drifts meanwhile)
      if (!menu) inspect = stage === 'room' && flight.enabled
        ? nextInspect(inspect, heroes, [p.x, p.y, p.z], [viewDirection.x, viewDirection.y, viewDirection.z], time) : INSPECT_NONE;
      field.setInspect(inspect.hero);
      field.setStepBack(menu ? 1 : 0);
      menuView.update(stage === 'room' && menu ? { index: menu.index, refused } : null, time, dt, camera, eye.object.position);
      // the void's choice is offered whenever the void has no room, as soon as the three small rooms are made
      if (stage === 'void' && !menu && !chosenMood()) { if (moodsMade) menu = menuOpen(0, MOODS.length); else makeMoods(); }
      moodView.update(stage === 'void' && menu ? { index: menu.index, refused: unrefused } : null, time, dt, camera, eye.object.position);
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
      leaving.abort();
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', onClick);
      globalThis.speechSynthesis?.cancel();
      flight.dispose();
      scene.remove(field.object, eye.object, menuView.object, moodView.object);
      menuView.dispose();
      moodView.dispose();
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
