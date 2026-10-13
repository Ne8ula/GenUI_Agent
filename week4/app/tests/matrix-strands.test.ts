import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { ConstructionDisc, ConstructionStroke } from '../src/scene/constructionTypes.ts';
import { buildSeed33Construction } from '../src/scene/seed33Construction.ts';
import type { PhotoManifestData, PhotoTileRegion } from '../src/scene/types.ts';

const BUILD_MS = 12_000;

// Captured before the matrix-material pass. These are immutable approval evidence, not regenerated
// expectations. See w4-20261008-seed33-matrix-r1/implementation/baseline-strands.json.
const STRAND_BASELINE = [
  { seed: 33, timeMs: 0, count: 0, sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945' },
  { seed: 33, timeMs: 1200, count: 120, sha256: 'a75f828f2d1013a600b330002c18d5d9c4551f2957639e86f24f67a5f184315c' },
  { seed: 33, timeMs: 3000, count: 464, sha256: '146a263ae151d555aa6c491367ec2bb9eba9253729c4b83755e76718c543fc3b' },
  { seed: 33, timeMs: 4800, count: 753, sha256: 'd4d5a77ba211fa77f9828ac19442c7267ae6a1e65ead41ba25158d71c03a59c6' },
  { seed: 33, timeMs: 6240, count: 880, sha256: 'e89456a24f7de89cd710c4ead9cf4d34253e14b2da32596bb3b3f9fc6f795c1e' },
  { seed: 33, timeMs: 8040, count: 785, sha256: '610e817033f9bae2c6d003c95410a0ac3e0d8d319797ccc33b0692bea10b79fb' },
  { seed: 33, timeMs: 9600, count: 721, sha256: '91450315fc47bba99f69d8be67a0e02e2f9c1cd8933462d47d3ddbe4a4640d66' },
  { seed: 33, timeMs: 11040, count: 716, sha256: 'd6e4bea3b51cb82a508a9ab4152e01e056960f9ee4820db727cbe36fefd61f40' },
  { seed: 33, timeMs: 11988, count: 0, sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945' },
  { seed: 33, timeMs: 12000, count: 0, sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945' },
  { seed: 33, timeMs: 17000, count: 0, sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945' },
  { seed: 11, timeMs: 0, count: 0, sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945' },
  { seed: 11, timeMs: 1200, count: 131, sha256: '7c4fe2526e401fe9c844c1908979debfff42e3a3e3760a0712def51a65fea8b2' },
  { seed: 11, timeMs: 3000, count: 456, sha256: 'f4f652f5fe746a121567fafa39cc873a3634a51a00894b4492545f5a820fef17' },
  { seed: 11, timeMs: 4800, count: 790, sha256: '56f60baa6b7637e9a0421adf4d794f9ae7120deec640dbcfd7783cc58c00bcb3' },
  { seed: 11, timeMs: 6240, count: 875, sha256: 'ecdd8f8b8ef6497e5c211ae2fa11b77b570e907606ff65a862ef740b6d78933b' },
  { seed: 11, timeMs: 8040, count: 772, sha256: '3058e54905e3c3ff3ee034c044e97f22ac243ef512d11aaa32a68ef7d87b2f33' },
  { seed: 11, timeMs: 9600, count: 726, sha256: 'a0ecddecabc20fa0c7e4af09bad9d7ae42be2c016baef20cdb01793de62164e9' },
  { seed: 11, timeMs: 11040, count: 716, sha256: 'a91c3cda692baa6b0e9b5c273f40045fb08b4c646a8dbba5618052c74136b5d7' },
  { seed: 11, timeMs: 11988, count: 0, sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945' },
  { seed: 11, timeMs: 12000, count: 0, sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945' },
  { seed: 11, timeMs: 17000, count: 0, sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945' },
] as const;

interface SourceManifest {
  figure: { cropBoxInBackgroundFrac: readonly [number, number, number, number] };
  tiles: {
    size: readonly [number, number];
    regions: readonly {
      id: string;
      group: PhotoTileRegion['group'];
      sourceBoxPx: readonly [number, number, number, number];
      rect: readonly [number, number, number, number];
    }[];
  };
}

async function readRuntimeManifest(): Promise<PhotoManifestData> {
  const source = JSON.parse(
    await readFile(new URL('../public/assets/seed33/manifest.json', import.meta.url), 'utf8'),
  ) as SourceManifest;
  return {
    figureHomeRectNorm: source.figure.cropBoxInBackgroundFrac,
    tilesAtlasSizePx: source.tiles.size,
    tileRegions: source.tiles.regions.map((region): PhotoTileRegion => ({
      id: region.id,
      group: region.group,
      sourceBoxPx: region.sourceBoxPx,
      rectNorm: region.rect,
    })),
  };
}

function strandFingerprint(commands: readonly (ConstructionStroke | ConstructionDisc)[]): string {
  return createHash('sha256').update(JSON.stringify(commands)).digest('hex');
}

test('approved Seed-33 strand commands remain byte-for-byte stable through matrix-material integration', async () => {
  const manifest = await readRuntimeManifest();
  assert.ok(manifest.tileRegions.length > 0, 'runtime manifest reconstruction includes source tiles');

  for (const expected of STRAND_BASELINE) {
    const plan = buildSeed33Construction({
      timeMs: expected.timeMs,
      buildMs: BUILD_MS,
      seed: expected.seed,
      reducedMotion: false,
      showTiles: true,
      manifest,
    });
    const strands = plan.commands.filter(
      (command): command is ConstructionStroke | ConstructionDisc => command.kind === 'stroke' || command.kind === 'disc',
    );
    assert.equal(strands.length, expected.count, `seed ${expected.seed} at ${expected.timeMs}ms: strand count`);
    assert.equal(strandFingerprint(strands), expected.sha256, `seed ${expected.seed} at ${expected.timeMs}ms: ordered strand hash`);
  }
});
