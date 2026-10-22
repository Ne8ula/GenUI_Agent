import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = fileURLToPath(new URL('../../../.local/reconstruction/teal-bedroom-repair-input-v3/', import.meta.url));
await mkdir(out);
const browser = await chromium.launch(browserOptions());
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto('http://127.0.0.1:1440/?scene=teal-bedroom');
  const probe = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { captureSource } = await import('/src/bedroom/capture.ts');
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas });
    const geometry = new THREE.PlaneGeometry(20, 20), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material); mesh.position.z = -2; mesh.updateMatrixWorld();
    const camera = new THREE.PerspectiveCamera(70, 1, .025, 40);
    try { return captureSource(renderer, mesh, camera); }
    finally { geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); }
  });
  const probeBytes = Buffer.from(probe.depth, 'base64');
  for (let i = 0; i < probeBytes.length; i += 4) assert.ok(Math.abs(probeBytes.readFloatLE(i) - 2) < .00001, 'GPU camera-Z depth agrees with known plane');
  assert.equal(probe.supported, 512 * 512);
  await page.getByRole('button', { name: 'Add teddy', exact: true }).waitFor();
  await page.waitForFunction(() => window.__evaBedroom?.snapshot().sourceVertices === 622077);
  const before = await page.evaluate(() => window.__evaBedroom.snapshot());
  const views = [];
  for (const [id, position, target] of [
    ['wall', [-.65, 4, -.1], [1.1, 3.2, .3]],
    ['wardrobe', [.8, 3.5, -.1], [-.8, 1.7, .2]],
    ['ceiling', [.0, 3.0, -.3], [-.2, 3.6, 1.05]],
  ]) {
    const capture = await page.evaluate(async ({ position, target }) => window.__evaBedroom.capture(position, target), { position, target });
    const { rgb, mask, depth, supported, ...camera } = capture;
    await writeFile(`${out}/${id}-source.png`, Buffer.from(rgb, 'base64'), { flag: 'wx' });
    const masks = await page.evaluate(async ({ mask, id }) => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${mask}`)).blob());
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); image.close();
      // Explicit owner-approved fixture repair, not automatic object identification.
      if (id === 'ceiling') { ctx.fillStyle = 'white'; ctx.fillRect(165, 175, 115, 130); }
      if (id === 'wardrobe') { ctx.fillStyle = 'black'; ctx.fillRect(28, 160, 150, 332); }
      const geometryMask = canvas.toDataURL('image/png').split(',')[1];
      const pixels = ctx.getImageData(0, 0, 512, 512);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const edit = pixels.data[i] === 255;
        pixels.data.set([255, 255, 255, edit ? 0 : 255], i);
      }
      ctx.putImageData(pixels, 0, 0);
      return { geometryMask, alphaMask: canvas.toDataURL('image/png').split(',')[1] };
    }, { mask, id });
    await writeFile(`${out}/${id}-mask.png`, Buffer.from(masks.geometryMask, 'base64'), { flag: 'wx' });
    await writeFile(`${out}/${id}-edit-mask.png`, Buffer.from(masks.alphaMask, 'base64'), { flag: 'wx' });
    await writeFile(`${out}/${id}-depth.bin`, Buffer.from(depth, 'base64'), { flag: 'wx' });
    views.push({ id, ...camera, rgb: `${id}-source.png`, repaired_rgb: `${id}-repaired.png`, mask: `${id}-mask.png`, depth: `${id}-depth.bin` });
    console.log(`${id}: ${supported} source pixels / ${512 * 512}, camera preserved`);
  }
  assert.deepEqual(await page.evaluate(() => window.__evaBedroom.snapshot()).then(v => v.camera), before.camera);
  await writeFile(`${out}/manifest.json`, JSON.stringify({ version: 1, source_mesh_sha256: 'd3296808e9cb9deec138fa1fce02495d5f84a0e894f56008d7013aedc7721bdc', views, bounds: [[-3.1723101139068604, -1.5652999877929688, -1.4752999544143677], [1.9918700456619263, 5.783689975738525, 1.0950000286102295]] }, null, 2), { flag: 'wx' });
  console.log('PASS: synthetic GPU depth calibration and three source-only renders; no reconstruction processing or cloud submission');
} finally { await browser.close(); }
