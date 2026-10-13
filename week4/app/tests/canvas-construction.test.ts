import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConstructionPlan } from '../src/scene/constructionTypes.ts';
import { createConstructionCanvasRenderer, solveAffineTriangle, type AffineTransform } from '../src/render/constructionCanvas.ts';

test('affine triangle maps source pixels to destination pixels', () => {
  const out: AffineTransform = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
  assert.equal(solveAffineTriangle(0, 0, 10, 0, 0, 20, 5, 7, 25, 7, 5, 67, out), true);
  assert.deepEqual(out, { a: 2, b: 0, c: 0, d: 3, e: 5, f: 7 });
  assert.equal(out.a * 10 + out.c * 0 + out.e, 25);
  assert.equal(out.b * 0 + out.d * 20 + out.f, 67);
  assert.equal(solveAffineTriangle(0, 0, 0, 0, 0, 0, 5, 7, 25, 7, 5, 67, out), false);
});

test('construction canvas preserves order, scales CSS geometry and skips degenerate texture triangles', () => {
  const events: string[] = [];
  const observed = { lineWidth: 0, radius: 0, drawImages: 0 };
  const fakeContext = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    lineCap: 'butt',
    lineJoin: 'miter',
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    save(): void {},
    restore(): void {},
    beginPath(): void {},
    rect(_x: number, _y: number, _w: number, _h: number): void {},
    clip(): void {},
    moveTo(_x: number, _y: number): void {},
    lineTo(_x: number, _y: number): void {},
    closePath(): void {},
    stroke(): void {
      observed.lineWidth = this.lineWidth;
      events.push('stroke');
    },
    arc(_x: number, _y: number, radius: number, _start: number, _end: number): void {
      observed.radius = radius;
    },
    fill(): void {
      events.push(observed.radius > 0 && events.length === 1 ? 'disc' : 'solid');
    },
    transform(_a: number, _b: number, _c: number, _d: number, _e: number, _f: number): void {},
    drawImage(_image: CanvasImageSource, _dx: number, _dy: number): void {
      observed.drawImages += 1;
      events.push('texture');
    },
  };

  const plan: ConstructionPlan = {
    active: true,
    progress: 0.5,
    figureStage: 'volume',
    stats: { growingStrands: 1, completedStrands: 0, movingTiles: 0 },
    commands: [
      { kind: 'stroke', id: 'architecture:path', component: 'architecture', alpha: 1, points: [[0, 0], [1, 1]], widthPx: 4, colour: [1, 0.5, 0] },
      { kind: 'disc', id: 'architecture:tip', component: 'architecture', alpha: 1, center: [0.5, 0.5], radiusPx: 6, colour: [1, 1, 1] },
      { kind: 'solid', id: 'figure:volume:torso', component: 'figure:volume', alpha: 0.8, points: [[0.2, 0.2], [0.3, 0.2], [0.25, 0.4]], colour: [0.8, 0.6, 0.4] },
      {
        kind: 'texture',
        id: 'figure:garment:panel',
        component: 'figure:garment',
        alpha: 1,
        texture: 'figure',
        vertices: [
          { x: 0.2, y: 0.2, u: 0, v: 0 },
          { x: 0.3, y: 0.2, u: 1, v: 0 },
          { x: 0.2, y: 0.4, u: 0, v: 1 },
        ],
      },
      {
        kind: 'texture',
        id: 'figure:garment:degenerate',
        component: 'figure:garment',
        alpha: 1,
        texture: 'figure',
        vertices: [
          { x: 0.2, y: 0.2, u: 0, v: 0 },
          { x: 0.3, y: 0.2, u: 0, v: 0 },
          { x: 0.2, y: 0.4, u: 0, v: 0 },
        ],
      },
    ],
  };
  const image = { width: 100, height: 50 } as ImageBitmap;
  const renderer = createConstructionCanvasRenderer(fakeContext as unknown as CanvasRenderingContext2D);
  const stats = renderer.draw(plan, { left: 10, top: 20, width: 200, height: 540 }, {
    background: image,
    foreground: image,
    figure: image,
    tiles: image,
  });

  assert.equal(observed.lineWidth, 2);
  assert.equal(observed.radius, 3);
  assert.equal(observed.drawImages, 1);
  assert.deepEqual(events, ['stroke', 'disc', 'solid', 'texture']);
  assert.deepEqual(stats, { commandsDrawn: 4, degenerateTriangles: 1, tilesShown: 0 });

  const material = plan.commands[3]!;
  assert.equal(material.kind, 'texture');
  const tilePlan: ConstructionPlan = {
    ...plan,
    commands: [
      { ...material, id: 'tile:left-coral:a', texture: 'tiles' },
      { ...material, id: 'tile:left-coral:b', texture: 'tiles' },
      { ...material, id: 'tile:hidden:a', texture: 'tiles', alpha: 0 },
      { kind: 'stroke', id: 'architecture:birth', component: 'architecture', alpha: 1, points: [[0.2, 0.3]], widthPx: 4, colour: [1, 1, 1] },
    ],
  };
  const textures = { background: image, foreground: image, figure: image, tiles: image };
  const frame = { left: 10, top: 20, width: 200, height: 540 };
  assert.deepEqual(renderer.draw(tilePlan, frame, textures), { commandsDrawn: 3, degenerateTriangles: 0, tilesShown: 1 });
  assert.equal(observed.radius, 1, 'one-point stroke draws the same half-width cap as WebGL2');
  assert.deepEqual(renderer.draw({ ...tilePlan, commands: [] }, frame, textures), { commandsDrawn: 0, degenerateTriangles: 0, tilesShown: 0 });
  assert.deepEqual(renderer.draw({ ...tilePlan, active: false }, frame, textures), { commandsDrawn: 0, degenerateTriangles: 0, tilesShown: 0 });
});
