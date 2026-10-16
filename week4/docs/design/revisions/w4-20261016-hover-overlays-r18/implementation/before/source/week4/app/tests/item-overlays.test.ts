import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ITEM_OVERLAY_CONTENT,
  MOBILE_BREAKPOINT_PX,
  MAX_INSETS_DESKTOP,
  MAX_INSETS_MOBILE,
  INSET_HOLD_SECONDS,
  SOURCE_ASPECT,
  isMobileViewport,
  projectSourcePoint,
  projectSourceRect,
  resolvePhotoForObject,
  activeInsetIds,
  itemOverlayLayout,
  type OverlayPhoto,
} from '../src/arrival/item-overlays.ts'

const DESKTOP = { width: 1920, height: 1080 }
const MOBILE = { width: 390, height: 844 }
const SOURCE_SIZED = { width: 3392, height: 1720 } // exactly matches SOURCE_ASPECT

const PHOTOS: readonly OverlayPhoto[] = [
  { id: 'montmartre', src: '/sources/paris-r15/montmartre-1980.jpg', title: 'Montmartre · 1980', creditHref: '/sources/paris-r17/credits.html#montmartre' },
  { id: 'montparnasse', src: '/sources/paris-r15/montparnasse-1980.jpg', title: 'Montparnasse · 1980', creditHref: '/sources/paris-r17/credits.html#montparnasse' },
  { id: 'beaubourg', src: '/sources/paris-r17/beaubourg-1980s.jpg', title: 'Beaubourg · 1980s', creditHref: '/sources/paris-r17/credits.html#beaubourg' },
  { id: 'rue-christine', src: '/sources/paris-r10/rue-christine-1988.jpg', title: 'Rue Christine · 1988', creditHref: '/sources/paris-r17/credits.html#rue-christine' },
]

test('stable accessible content list has four distinct ids, titles and descriptions', () => {
  assert.equal(ITEM_OVERLAY_CONTENT.length, 4)
  const ids = new Set(ITEM_OVERLAY_CONTENT.map(item => item.id))
  assert.equal(ids.size, 4)
  for (const item of ITEM_OVERLAY_CONTENT) {
    assert.ok(item.title.length > 0)
    assert.ok(item.description.length > 0)
  }
})

test('breakpoint constant matches the documented mobile threshold', () => {
  assert.equal(MOBILE_BREAKPOINT_PX, 650)
  assert.ok(isMobileViewport(MOBILE))
  assert.ok(!isMobileViewport(DESKTOP))
})

test('projectSourcePoint centres and margins the source image when viewport aspect matches source aspect', () => {
  const topLeft = projectSourcePoint(0, 0, SOURCE_SIZED)
  const bottomRight = projectSourcePoint(1, 1, SOURCE_SIZED)
  // A small symmetric margin (the renderer's /.96 frustum padding) on every edge.
  assert.ok(topLeft.x > 0 && topLeft.x < SOURCE_SIZED.width * 0.05)
  assert.ok(topLeft.y > 0 && topLeft.y < SOURCE_SIZED.height * 0.05)
  assert.ok(bottomRight.x > SOURCE_SIZED.width * 0.95 && bottomRight.x < SOURCE_SIZED.width)
  assert.ok(bottomRight.y > SOURCE_SIZED.height * 0.95 && bottomRight.y < SOURCE_SIZED.height)
  // Centre of the source image lands on the centre of the viewport.
  const centre = projectSourcePoint(0.5, 0.5, SOURCE_SIZED)
  assert.ok(Math.abs(centre.x - SOURCE_SIZED.width / 2) < 1e-6)
  assert.ok(Math.abs(centre.y - SOURCE_SIZED.height / 2) < 1e-6)
})

test('projectSourceRect produces a normalised, non-negative pixel box that scales linearly with viewport size', () => {
  const rect = [.17, .36, .465, .61] as const
  const small = projectSourceRect(rect, DESKTOP)
  const big = projectSourceRect(rect, { width: DESKTOP.width * 2, height: DESKTOP.height * 2 })
  assert.ok(small.width > 0 && small.height > 0)
  assert.ok(Math.abs(big.left - small.left * 2) < 1)
  assert.ok(Math.abs(big.top - small.top * 2) < 1)
  assert.ok(Math.abs(big.width - small.width * 2) < 1)
  assert.ok(Math.abs(big.height - small.height * 2) < 1)
})

test('projectSourceRect degrades to a zero box instead of throwing for an invalid viewport', () => {
  const rect = [.1, .1, .2, .2] as const
  const box = projectSourceRect(rect, { width: 0, height: 0 })
  assert.deepEqual(box, { left: 0, top: 0, width: 0, height: 0 })
  const nanBox = projectSourceRect(rect, { width: NaN, height: 800 })
  assert.deepEqual(nanBox, { left: 0, top: 0, width: 0, height: 0 })
})

test('SOURCE_ASPECT matches the renderer manifest (3392x1720)', () => {
  assert.ok(Math.abs(SOURCE_ASPECT - 3392 / 1720) < 1e-9)
})

test('resolvePhotoForObject matches only the preferred known id, with no fuzzy fallback', () => {
  assert.equal(resolvePhotoForObject('street-lantern', PHOTOS)?.id, 'montmartre')
  assert.equal(resolvePhotoForObject('cafe-terrace', PHOTOS)?.id, 'rue-christine')
  assert.equal(resolvePhotoForObject('bistro-chairs', PHOTOS)?.id, 'montparnasse')
  assert.equal(resolvePhotoForObject('stone-paving', PHOTOS)?.id, 'beaubourg')
  assert.equal(resolvePhotoForObject('stone-paving', []), undefined)
  assert.equal(resolvePhotoForObject('not-a-real-object', PHOTOS), undefined)
})

test('activeInsetIds is deterministic, bounded by viewport capacity, and empty with no available photos', () => {
  const ids = ['a', 'b', 'c', 'd']
  const first = activeInsetIds(3, DESKTOP, ids)
  const second = activeInsetIds(3, DESKTOP, ids)
  assert.deepEqual(first, second, 'pure function must be deterministic for same input')
  assert.ok(first.length <= MAX_INSETS_DESKTOP)
  assert.equal(new Set(first).size, first.length, 'no duplicate ids')
  assert.deepEqual(activeInsetIds(3, MOBILE, ids).length <= MAX_INSETS_MOBILE, true)
  assert.deepEqual(activeInsetIds(3, DESKTOP, []), [])
})

test('activeInsetIds rotates over idleSeconds and eventually reaches every available id', () => {
  const ids = ['a', 'b', 'c', 'd']
  const seen = new Set<string>()
  for (let t = 0; t < INSET_HOLD_SECONDS * ids.length * 2; t += 0.5) {
    activeInsetIds(t, DESKTOP, ids).forEach(id => seen.add(id))
  }
  assert.equal(seen.size, ids.length)
})

test('itemOverlayLayout shows four object-bound boxes on desktop even with no photos available', () => {
  const layout = itemOverlayLayout(DESKTOP, 0, false, [])
  assert.equal(layout.boxes.length, 4)
  const ids = new Set(layout.boxes.map(b => b.id))
  assert.equal(ids.size, 4)
  assert.equal(layout.insets.length, 0)
  assert.equal(layout.connectors.length, 0)
  for (const box of layout.boxes) {
    assert.equal(box.active, false)
    assert.notEqual(box.tone, 'blue')
  }
})

test('itemOverlayLayout links up to MAX_INSETS_DESKTOP distinct photo insets with matching connectors and blue-toned boxes', () => {
  const layout = itemOverlayLayout(DESKTOP, 0, false, PHOTOS)
  assert.ok(layout.insets.length > 0 && layout.insets.length <= MAX_INSETS_DESKTOP)
  const insetSourceIds = layout.insets.map(i => i.photo.id)
  assert.equal(new Set(insetSourceIds).size, insetSourceIds.length, 'no duplicate inset source ids')
  assert.equal(layout.connectors.length, layout.insets.length)
  const activeBoxIds = new Set(layout.boxes.filter(b => b.active).map(b => b.id))
  assert.equal(activeBoxIds.size, layout.insets.length)
  for (const box of layout.boxes) {
    if (box.active) assert.equal(box.tone, 'blue')
    else assert.notEqual(box.tone, 'blue')
  }
})

test('itemOverlayLayout reduced motion holds a single static inspectable reference regardless of idleSeconds', () => {
  const a = itemOverlayLayout(DESKTOP, 3, true, PHOTOS)
  const b = itemOverlayLayout(DESKTOP, 40, true, PHOTOS)
  assert.equal(a.insets.length, 1)
  assert.deepEqual(a.insets.map(i => i.objectId), b.insets.map(i => i.objectId))
  assert.deepEqual(a.boxes.map(x => x.tone), b.boxes.map(x => x.tone))
})

test('itemOverlayLayout narrow viewport shows at most one inset and reduces visible boxes to the active object', () => {
  const layout = itemOverlayLayout(MOBILE, 0, false, PHOTOS)
  assert.ok(layout.insets.length <= MAX_INSETS_MOBILE)
  assert.ok(layout.boxes.length <= MAX_INSETS_MOBILE, 'mobile keeps visible labels to the active object only')
})

test('itemOverlayLayout narrow viewport still shows exactly one labelled box with no photos available', () => {
  const layout = itemOverlayLayout(MOBILE, 10, false, [])
  assert.equal(layout.boxes.length, 1)
  assert.equal(layout.insets.length, 0)
  assert.equal(layout.connectors.length, 0)
})

test('itemOverlayLayout narrow viewport focus rotates across all objects over idleSeconds, independent of photo availability', () => {
  const seen = new Set<string>()
  for (let t = 0; t < INSET_HOLD_SECONDS * ITEM_OVERLAY_CONTENT.length * 2; t += 0.5) {
    itemOverlayLayout(MOBILE, t, false, []).boxes.forEach(box => seen.add(box.id))
  }
  assert.equal(seen.size, ITEM_OVERLAY_CONTENT.length)
})

test('every inset explicitly labels itself as an archive reference, not an exact match', () => {
  const layout = itemOverlayLayout(DESKTOP, 0, false, PHOTOS)
  assert.ok(layout.insets.length > 0)
  // The note text is authored once in ItemOverlays.tsx; this asserts the photo data
  // itself carries no exact-identification claim (title is era-only, no invented id).
  for (const inset of layout.insets) {
    assert.doesNotMatch(inset.photo.title, /CCTV|timestamp|#\w+\d+|FEMALE|MALE/i)
  }
})

test('all overlay geometry stays within viewport bounds and clears the reserved bottom prompt zone', () => {
  for (const viewport of [DESKTOP, MOBILE, { width: 1024, height: 700 }]) {
    const layout = itemOverlayLayout(viewport, 2.5, false, PHOTOS)
    for (const box of layout.boxes) {
      assert.ok(box.left >= 0 && box.left + box.width <= viewport.width + 1)
      assert.ok(box.top >= 0, `box top ${box.top} should not be negative`)
      assert.ok(box.top + box.height <= viewport.height - 100 + 1, 'box should clear the reserved bottom 100px prompt zone')
    }
    for (const inset of layout.insets) {
      assert.ok(inset.left >= 0 && inset.left + inset.width <= viewport.width + 1)
      assert.ok(inset.top >= 0 && inset.top + inset.height <= viewport.height - 100 + 1)
    }
  }
})

test('itemOverlayLayout degrades to no overlays for an invalid viewport instead of throwing', () => {
  assert.deepEqual(itemOverlayLayout({ width: 0, height: 0 }, 0, false, PHOTOS), { boxes: [], insets: [], connectors: [] })
  assert.deepEqual(itemOverlayLayout({ width: NaN, height: 800 }, 0, false, PHOTOS), { boxes: [], insets: [], connectors: [] })
})

test('negative or non-finite idleSeconds are treated as zero, not propagated as NaN', () => {
  const layout = itemOverlayLayout(DESKTOP, -5, false, PHOTOS)
  for (const box of layout.boxes) {
    assert.ok(Number.isFinite(box.left))
    assert.ok(Number.isFinite(box.top))
  }
  const nanLayout = itemOverlayLayout(DESKTOP, NaN, false, PHOTOS)
  for (const box of nanLayout.boxes) {
    assert.ok(Number.isFinite(box.left))
    assert.ok(Number.isFinite(box.top))
  }
})

test('desktop bounds stay fixed while reference selections rotate', () => {
  const geometry = (t: number) => itemOverlayLayout(DESKTOP, t, false, PHOTOS).boxes.map(({ id, left, top, width, height }) => ({ id, left, top, width, height }))
  assert.deepEqual(geometry(0), geometry(6))
  assert.deepEqual(geometry(6), geometry(60))
})

test('reference insets do not overlap each other or the prompt at QHD', () => {
  const viewport = { width: 2560, height: 1440 }
  for (const t of [0, 5, 10, 50]) {
    const { insets } = itemOverlayLayout(viewport, t, false, PHOTOS)
    for (let i = 0; i < insets.length; i++) {
      const a = insets[i]!
      assert.ok(a.top + a.height <= viewport.height - 100)
      for (const b of insets.slice(i + 1)) {
        assert.ok(a.top + a.height <= b.top || b.top + b.height <= a.top || a.left + a.width <= b.left || b.left + b.width <= a.left)
      }
    }
  }
})

test('connectors only join a box to its own linked inset, with finite geometry', () => {
  const layout = itemOverlayLayout(DESKTOP, 0, false, PHOTOS)
  const insetByObject = new Map(layout.insets.map(i => [i.objectId, i]))
  for (const connector of layout.connectors) {
    assert.ok(insetByObject.has(connector.objectId))
    assert.ok(Number.isFinite(connector.left) && Number.isFinite(connector.top))
    assert.ok(Number.isFinite(connector.length) && connector.length >= 0)
    assert.ok(Number.isFinite(connector.angleDeg))
  }
})
