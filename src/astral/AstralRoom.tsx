/// <reference types="vite/client" />
import { useEffect, useRef } from 'react';
import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { createDataLayer } from './data-layer.ts';
import { createAstralEye } from './eye.ts';
import { START_POSITION, arrivalPath, createFlight, holdingGlide, type Vec3 } from './flight.ts';
import { createGlow } from './glow.ts';
import { decideChange, roomSpent } from './grammar-decide.ts';
import { MOODS, roomState, roomValues, standingNow, type BaseRoom, type Change, type Pose, type Thing } from './grammar.ts';
import { createInspectMarks } from './inspect-marks.ts';
import { INSPECT_NONE, nextInspect } from './inspect.ts';
import { createMenuView } from './menu-view.ts';
import { MENU_NOTHING, MENU_REFUSED, entryPoints, menuDrag, menuOpen, menuStep, type MenuPoints, type MenuRefused, type MenuState } from './menu.ts';
import { floorOf, litLikeRoom, loadObjectPoints, loadShelf, replaceHero, roomCast } from './object-points.ts';
import { LIGHTING_START, createPointField, createTunnelCloud, nextLighting } from './point-field.ts';
import { pickSeed, readLedger, writeLedger } from './replacements.ts';
import { loadRecordedRoomCloud } from './room-source.ts';
import { parseSwap, swapHero, swapTimes, type Move, type Stood } from './object-change.ts';
import { createSplatView, type SplatView } from './splat-view.ts';
import { REFUSALS, SIDE_TEASES, sideTeaseDue, speakLine, stopSpeaking } from './tease.ts';
import { createWater, type AstralWater } from './water.ts';
import { ASTRAL_EFFECTS, TUNNEL, type AstralLight, type AstralPhase, type PointCloud, type RoomHero } from './types.ts';
import { chooseMood, chosenMood, forgetMood } from './mood-choice.ts';
import { createMoodView } from './mood-view.ts';
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
// Development only: ?swap=<hero>,<progress>[,<pose>[,<way>[,<thing>[,<wrong>]]]] replaces that hero with a shelf object (the
// first, unless named) in that pose once the viewer has the room, and holds the change (object-change.ts) at that progress, for
// matching captures. `wrong` is a discrepancy (LIMINAL-GRAMMAR.md, step 4): its size, its number, or the thing gone. It is
// not remembered. It is read again whenever the address changes without a load (history.replaceState, then a popstate event), so one
// page can show many.
const devSwap = () => import.meta.env.DEV ? parseSwap(window.location.search) : null;
/** A choice in the menu: an object of the shelf, or (no model) "nothing", or an entry EVA will not do. */
type Choice = { id: string; glb: string } | { id: MenuRefused | typeof MENU_NOTHING; glb: null };
/** How a thing stands in a slot: the grammar's pose, size and number (a Change is one), and object-change.ts's variants of its arrival. */
type Stance = { pose: Pose; other?: boolean; loose?: boolean; carried?: boolean; factor?: number; copies?: number };
/** The sampling of a thing made larger, against the room's lattice (1 is the room's own spacing, 2 an object's usual). A starting value, to judge from captures. */
const ENLARGED_DENSITY = 1.4;

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
    // Live values as marks at the frame's corners (kept by the owner, 2026-11-17).
    const data = createDataLayer(host);
    // Look and it answers: the room's heroes, which one the viewer is inspecting, and its marks.
    const marks = createInspectMarks(host);
    let heroes: RoomHero[] = [];
    let inspect = INSPECT_NONE;
    // Replacing a hero: the room as it now is (object-points.ts makes the changed one), the menu of choices, and what EVA refused in it.
    const menuView = createMenuView();
    scene.add(menuView.object);
    let room: PointCloud | null = null;
    let arrived: PointCloud | null = null;   // the room as it arrived: an absent thing's floor is laid from the floor it had then
    let cast: [number, number, number] = [1, 1, 1];   // and its cast, which a placed thing is lit by
    const floors = new Map<number, number>();   // the heroes whose slot's carpet has been laid as a cloud of its own, and its points
    let things: (Thing & { glb: string })[] = [];   // the shelf: what the grammar decides about, and each thing's model
    let choices: Choice[] = [];
    let menu: MenuState | null = null;
    const refused = new Set<number>();
    const said: Partial<Record<keyof typeof REFUSALS, number>> = {};
    let changing = false, changeUntil = 0;   // an object is being fetched for a change; the change it started runs until then
    // EVA decides (LIMINAL-GRAMMAR.md, step 5): what the room is to the grammar, its ledger, and the changes of an accepted
    // decision still to be shown, in order. A room that arrives with a ledger has `standing` put back as it forms.
    type Made = { hero: number; object: Stood; floor: PointCloud | null };
    const remembered = new WeakMap<PointCloud, { ledger: Change[]; standing: Made[] }>();
    let base: BaseRoom | null = null, ledger: Change[] = [], queue: Change[] = [], standing: Made[] = [];
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
    let swaps = 0; // presses of the development key G: each takes the shelf's next thing
    let generation: AbortController | undefined;
    let pendingRoom: { cloud: PointCloud; notBefore: number } | undefined;
    let arrival: { from: Vec3; velocity: Vec3; to: Vec3; lookFrom: Vec3; lookTo: Vec3 } | undefined;

    const enterStage = (next: Stage) => { stage = next; stageAt = time; menu = null; queue = []; };
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
      room = arrived = cloud;
      floors.clear();
      cast = roomCast(cloud);
      base = cloud.base ?? null;
      ({ ledger, standing } = remembered.get(cloud) ?? { ledger: [], standing: [] });
      menu = null; queue = [];
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
      room = arrived = base = null;
      ledger = []; standing = [];
      floors.clear();
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
    // a unit box for its place in the menu; an object that will not load is left out of the menu. After them, "nothing", then the
    // entries EVA will not do.
    let shelf: Promise<void> | undefined;
    const prepareShelf = () => (shelf ??= (async () => {
      const signal = leaving.signal, list: Choice[] = [], thumbs: MenuPoints[] = [];
      things = await loadShelf(signal);
      for (const { id, glb } of things) {
        try { thumbs.push(await loadObjectPoints(glb, { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] }, signal, 1)); list.push({ id, glb }); }
        catch (error) { signal.throwIfAborted(); console.warn(`[astral] the shelf's "${id}" could not be loaded and is left out of the menu.`, error); }
      }
      for (const id of [MENU_NOTHING, ...MENU_REFUSED] as const) { list.push({ id, glb: null }); thumbs.push(entryPoints(id)); }
      choices = list;
      menuView.setChoices(thumbs);
    })().catch(error => { if (!leaving.signal.aborted) console.error('[astral] the menu has nothing to offer', error); }));

    /** Shelf thing `id` as it stands in a hero's slot of a room, lit by the room's `light`; or, for null, nothing: an absence. */
    const standIn = async (of: PointCloud, box: RoomHero, id: string | null, stance: Stance, light: [number, number, number], signal: AbortSignal): Promise<Stood & { move?: Move }> => {
      if (id === null) return { count: 0, positions: new Float32Array(0), colors: new Float32Array(0), normals: new Float32Array(0) };
      const thing = things.find(thing => thing.id === id), factor = stance.factor ?? 1;
      if (!thing) throw new Error(`The shelf has no "${id}".`);
      // A thing made larger is sampled coarser than an object usually is: at an object's own spacing it is a smooth picture, far
      // more detailed than the room round it (owner, 2026-11-17). Not as coarse as the room's own spacing: seen from near, that
      // is more gap than grain, and what stands behind the thing shows through it.
      const object = await loadObjectPoints(thing.glb, box, signal, factor > 1 ? ENLARGED_DENSITY : undefined, thing.height * factor,
        { ...stance, places: (of.places ?? []).slice(0, (stance.copies ?? 1) - 1) });
      litLikeRoom(object, light);
      return object;
    };

    /**
     * The recorded base room of the mood picked in the void, and with it the room's ledger (replacements.ts): what stands in
     * each slot a visitor changed is made ready here, each in its pose, size and number, and put back as the room forms. One
     * that cannot be made is skipped.
     */
    const loadRoom = async (signal: AbortSignal) => {
      const cloud = await loadRecordedRoomCloud(renderer, signal, chosenMood());
      if (!cloud.base) return cloud;
      await prepareShelf();
      let stored = readLedger(cloud.base, things);
      // A room is spent by one visitor and ends when they leave. A spent ledger still stored means the page went before their 45
      // seconds ran out; whoever arrives now is the next visitor, and does not find that room.
      if (roomSpent(cloud.base, stored, things)) { endRoom('found spent: its visitor has left'); stored = []; }
      const light = roomCast(cloud), standing: Made[] = [];
      for (const [slot, stands] of stored.length ? standingNow(cloud.base, stored) : []) {
        const hero = cloud.heroes?.findIndex(hero => hero.slot?.id === slot) ?? -1, box = cloud.heroes?.[hero];
        if (!box?.slot || !stands || !stored.some(change => change.slot === slot)) continue;
        try {
          const object = await standIn(cloud, box, stands.thing, stands, light, signal);
          standing.push({ hero, object, floor: box.slot.surface === 'floor' ? floorOf({ ...box, slot: box.slot }, cloud) : null });
        } catch (error) { signal.throwIfAborted(); console.warn(`[astral] what the ledger has in the slot "${slot}" could not be made again.`, error); }
      }
      remembered.set(cloud, { ledger: stored, standing });
      console.info(`[astral] the room's ledger, kept in this browser: ${stored.length} changes, ${standing.length} slots to put back as they were left.`);
      return cloud;
    };
    const startRecorded = () => {
      console.info('[astral] arriving in the RECORDED room fixture; this is not live generation.');
      void prepareShelf();
      requestRoom(loadRoom, REHEARSAL_MIN_SECONDS);
    };
    // The void's choice (mood-choice.ts, mood-view.ts): while no room exists, one body of grains waits in the void and takes the
    // selected mood's form; in the void `menu` is that choice, stepped and picked with the menu's keys and mouse. The mood
    // picked is the room loaded: each has its own recorded base room (loadRoom).
    const moodView = createMoodView();
    scene.add(moodView.object);
    const pickMood = () => {
      const mood = menu && MOODS[menu.index];
      if (!mood) return;
      chooseMood(mood);
      console.info(`[astral] mood chosen: "${mood}". Its room is that mood's RECORDED base room.`);
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
      speakLine(lines[n % lines.length]!, setSpeaking);
    };
    /**
     * Hero `hero` becomes the shelf's object `id`, or nothing (null: an absence, the slot's floor laid clean where the thing stood):
     * its points stand in the hero's slot at the thing's height and are exchanged for the hero's in the room's cloud
     * (object-points.ts), and the field shows the old object leaving and the new one arriving.
     * `stance`: the pose it stands in and arrives by, its size against its true size, and how many of it, the others standing in
     * the room's places (EVA's choice, or the development switch's), with the variants of object-change.ts's Move.
     * Nothing here is remembered: the room's memory is its ledger, written when EVA decides.
     * Known gap: the painted room (P) still shows the old object.
     */
    const replace = async (hero: number, id: string | null, progress: number | null, stance: Stance = { pose: 'rests' }) => {
      const from = room, box = from?.heroes?.[hero];
      if (!from || !box || changing || holdsWater(box)) return;
      changing = true;
      try {
        const object = await standIn(from, box, id, stance, cast, leaving.signal);
        if (room !== from || stage !== 'room') return;   // the room moved on while the object was being fetched
        // shortcut: the copies an object has in other places stay in this cloud when the hero is next replaced, though the field
        // drops them; only the cloud's count is off. Keep each hero's object apart and rebuild the cloud from the arrived room if
        // anything comes to read it.
        const next = replaceHero(from, hero, object), move = object.move ? { ...object.move, loose: stance.loose, carried: stance.carried } : null;
        if (!field.replaceHero(hero, object, progress, move)) return;
        // The slot's carpet. A hero's box is emptied whole, floor and all, so the first time a hero on a floor is replaced its
        // floor is laid again as a cloud of its own (owner, 2026-11-17), which stays through every later change there: no thing
        // that stands, sinks, moves or leaves in that slot touches it. It is in the field only, not in the room's cloud.
        if (box.slot?.surface === 'floor' && !floors.has(hero)) {
          const floor = floorOf({ ...box, slot: box.slot }, arrived ?? from);
          if (field.layFloor(hero, floor)) floors.set(hero, floor.count);
        }
        room = next; heroes = next.heroes ?? []; changeUntil = time + swapTimes(move).total;
        cloudCount = next.count + [...floors.values()].reduce((sum, count) => sum + count, 0);
        const copies = object.parts?.length ?? 1, factor = stance.factor ?? 1;
        if (copies < (stance.copies ?? 1)) console.info(`[astral] ${stance.copies} copies asked; the room has places for ${copies}.`);
        const what = id === null ? 'nothing' : `${copies > 1 ? `${copies} of ` : factor !== 1 ? `${factor} times ` : ''}"${id}"`;
        console.info(`[astral] "${box.name}" replaced by ${what} (${object.count} points; ${stance.pose}).`);
      } catch (error) {
        if (!leaving.signal.aborted) console.error('[astral] the replacement failed; the room is unchanged.', error);
      } finally { changing = false; }
    };
    /** Development only: the change the address's ?swap= names. A dropped thing has come from its own hover, so it is stood hovering
     * first; a thing that is gone stood there first, plainly. */
    const showDevSwap = async () => {
      const swap = devSwap();
      if (!swap || stage !== 'room') return;
      await prepareShelf();
      const id = swap.thing ?? things[0]?.id;
      if (!id) return;
      if (swap.pose === 'dropped') await replace(swap.hero, id, 1, { ...swap, pose: 'hovers' });
      if (swap.gone) await replace(swap.hero, id, 1, swap);
      await replace(swap.hero, swap.gone ? null : id, swap.progress, { ...swap, carried: swap.pose === 'dropped' });
    };
    const onAddress = () => void showDevSwap();
    /** The choices for the hero being inspected. Not during a change, nor over the painted room, which would not show one. */
    const openMenu = () => {
      const hero = heroes[inspect.hero];
      if (menu || !hero || stage !== 'room' || !flight.enabled || changing || queue.length || time < changeUntil || splatView?.active) return;
      if (holdsWater(hero)) { refuse('pool'); return; }
      refused.clear();
      // A spent room accepts nothing more: its menu opens with every entry already refused, so that shows without a word,
      // whether or not her line is heard over the room.
      if (base && roomSpent(base, ledger, things)) choices.forEach((_, index) => refused.add(index));
      menu = menuOpen(inspect.hero, choices.length);
    };
    /**
     * The visitor picked a thing, or "nothing", for the hero the menu is on. EVA decides (grammar-decide.ts): she refuses aloud
     * and nothing changes, or what she returns is what happens. The ledger is the room's memory from that moment; the changes
     * are then shown in order, the visitor's first, then each that puts an old discrepancy right.
     */
    const pickMenu = () => {
      const choice = menu && choices[menu.index];
      if (!menu || !choice) return;
      if (choice.glb === null && choice.id !== MENU_NOTHING) { refused.add(menu.index); refuse(choice.id); return; }
      const slot = heroes[menu.hero]?.slot?.id, picked = choice.glb === null ? null : choice.id;
      if (!base || !slot) {   // a room the grammar does not know (?room=surreal): the thing is stood plainly, and nothing is remembered
        if (picked) void replace(menu.hero, picked, null);
        menu = null;
        return;
      }
      // The seed comes from the ledger and the slot, not from chance; the time is the page's clock. The grammar reads neither itself.
      const decision = decideChange(base, ledger, things, slot, picked, pickSeed(base, ledger, slot), Date.now());
      if (decision.ok) {
        ledger = [...ledger, ...decision.changes];
        writeLedger(ledger);
        queue = [...decision.changes];
        menu = null;
      } else { refused.add(menu.index); refuse(decision.refusal); }
      if (import.meta.env.DEV) {   // development only: a visitor never sees EVA's values
        const values = roomValues(base, ledger, things), how = decision.ok
          ? decision.changes.map(change => `${change.slot}: ${change.thing ?? 'nothing'}, ${change.discrepancy ?? 'plain'}, ${change.pose}${change.factor !== 1 ? `, x${change.factor}` : ''}${change.copies !== 1 ? `, ${change.copies} of it` : ''}`).join('; then ')
          : `refused (${decision.refusal})`;
        console.info(`[astral] EVA decided on "${picked ?? 'nothing'}" for "${slot}": ${how}. Familiarity ${values.familiarity}, deviation ${values.deviation}, ambiguity ${values.ambiguity}: ${roomState(values)}${roomSpent(base, ledger, things) ? ', spent' : ''}.`);
      }
    };
    /** The room is over, spent or cleared by the owner: its ledger is forgotten, and the next visitor does not find it. */
    const endRoom = (why: string) => {
      ledger = []; queue = [];
      writeLedger([]);
      forgetMood();   // no room exists now: the void offers the three moods to whoever comes next
      console.info(`[astral] the room is over (${why}): its ledger is cleared and its mood forgotten.`);
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
      data.resize();
      marks.resize();
    };
    resize();
    window.addEventListener('resize', resize);

    const stopAll = () => {
      stopped = true;
      stopSpeaking();
      stopGeneration();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // The owner's key, Shift+Delete, in any build: the room is cleared by hand. Whatever is formed disperses and its ledger is forgotten.
      if (event.code === 'Delete' && event.shiftKey) {
        event.stopPropagation();
        if (event.repeat) return;
        endRoom('cleared by the owner\'s key');
        generation?.abort();
        generation = undefined;
        if (stage !== 'void' && stage !== 'dissolving') dissolve(false);
        return;
      }
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
      // Development only: G replaces a hero (the one being inspected, else the nearest) without the menu and without EVA, by the
      // shelf's next object, resting. It is not in the ledger, so it is not remembered.
      if (import.meta.env.DEV && event.code === 'KeyG' && stage === 'room' && things.length) {
        const p = camera.position;
        void replace(swapHero(inspect.hero, heroes, [p.x, p.y, p.z]), things[swaps++ % things.length]!.id, null);
      }
    };
    const onMouseMove = (event: MouseEvent) => {
      present();
      // choosing: the mouse moves between the choices and the view holds still
      // (in the void a step takes four times the travel: the body needs a moment to gather into each form)
      if (menu) { menu = menuDrag(menu, event.movementX / host.clientWidth / (stage === 'void' ? 4 : 1)); return; }
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
    if (import.meta.env.DEV) window.addEventListener('popstate', onAddress);

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
          void showDevSwap();
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

      // What the ledger has standing in the room, put back as the room forms: each as an object of its own, settled, on its laid
      // floor, exactly as a change leaves it, so the next change there takes all of it away (a repeated thing's copies too). The
      // field refuses while the room's own grains are still being built; then it is asked again next frame.
      while (standing.length && room && field.replaceHero(standing[0]!.hero, standing[0]!.object, 1)) {
        const { hero, object, floor } = standing.shift()!;
        if (floor && field.layFloor(hero, floor)) floors.set(hero, floor.count);
        room = replaceHero(room, hero, object); heroes = room.heroes ?? [];
        cloudCount = room.count + [...floors.values()].reduce((sum, count) => sum + count, 0);
      }

      if (stage === 'room') {
        sideLow = Math.min(sideLow, side);
        sideHigh = Math.max(sideHigh, side);
        if (time - Math.max(lastInput, stageAt) > IDLE_SECONDS) {
          // the visitor has gone. A spent room goes with them, for good
          if (base && roomSpent(base, ledger, things)) endRoom('spent, and its visitor has left');
          dissolve(false);
        } else if (queue.length && !changing && time >= changeUntil) {
          // the next change of EVA's decision, once the one before it has run its course. A dropped thing is the one already
          // hovering there, put right: nothing leaves and nothing assembles
          const change = queue.shift()!;
          void replace(heroes.findIndex(hero => hero.slot?.id === change.slot), change.thing, null, { ...change, carried: change.pose === 'dropped' });
        }
        else if (!menu && sideTeaseDue(time, { since: stageAt, lastInput, lastTease, travelled: sideHigh - sideLow })) {   // not while they are choosing
          lastTease = time;
          speakLine(SIDE_TEASES[teases++ % SIDE_TEASES.length]!, setSpeaking);
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
      // the void's choice is offered whenever the void has no room
      if (stage === 'void' && !menu && !chosenMood()) menu = menuOpen(0, MOODS.length);
      moodView.update(stage === 'void' && menu ? menu.index : null, time, dt, camera);
      field.update(time, dt, camera);
      splatView?.update(dt);
      glow.setSceneDraw(splatView?.active ? splatView.drawLayers : null);
      glow.render();
      marks.update(heroes[inspect.hero] ?? null, camera, dt);
      const e = eye.object.position, inRoom = stage === 'arriving' || stage === 'room';
      data.update({
        frameMs, stage,
        viewer: { x: camera.position.x, y: camera.position.y, z: camera.position.z, dirX: viewDirection.x, dirZ: viewDirection.z },
        eye: { x: e.x, y: e.y, z: e.z, glow: eye.glow, phase: eyePhase },
        axisZ: stage === 'tunnel' || stage === 'arriving' ? camera.position.z : null,
        lighting: inRoom ? { mood: lighting.mood, lamp: roomLamps ? lighting.lamp : null } : null,
        points: cloudCount,
      });
    });

    return () => {
      generation?.abort();
      leaving.abort();
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onAddress);
      stopSpeaking();
      flight.dispose();
      scene.remove(field.object, eye.object, menuView.object, moodView.object);
      menuView.dispose();
      moodView.dispose();
      field.dispose();
      eye.dispose();
      splatView?.dispose();
      dropWater();
      glow?.dispose();
      data.dispose();
      marks.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return <div className="astral" ref={hostRef} />;
}
