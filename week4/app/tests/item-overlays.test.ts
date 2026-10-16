import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ITEM_OVERLAY_CONTENT, MOBILE_BREAKPOINT_PX, SOURCE_ASPECT,
  isMobileViewport, projectSourcePoint, projectSourceRect,
  resolvePhotoForObject, itemOverlayLayout, type OverlayPhoto,
} from '../src/arrival/item-overlays.ts'

const DESKTOP = { width: 1920, height: 1080 }
const MOBILE = { width: 390, height: 844 }
const SOURCE_SIZED = { width: 3392, height: 1720 }
const PHOTOS: readonly OverlayPhoto[] = ['montmartre', 'montparnasse', 'beaubourg', 'rue-christine', 'clichy'].map(id => ({
  id, src: `/fixtures/${id}.jpg`, title: `${id} · 1980s`, creditHref: `/credits#${id}`,
}))

test('stable accessible list preserves four prior ids and appends four right-side objects', () => {
  assert.deepEqual(ITEM_OVERLAY_CONTENT.map(item => item.id), [
    'cafe-terrace', 'street-lantern', 'bistro-chairs', 'stone-paving',
    'stop-sign', 'upper-window', 'right-doorway', 'shopfront-board',
  ])
  for (const item of ITEM_OVERLAY_CONTENT) {
    assert.ok(item.title.length > 0 && item.description.length > 0)
  }
})

test('breakpoint matches the documented mobile threshold', () => {
  assert.equal(MOBILE_BREAKPOINT_PX, 650)
  assert.ok(isMobileViewport(MOBILE))
  assert.ok(!isMobileViewport(DESKTOP))
})

test('source projection preserves renderer aspect, centre and margins', () => {
  assert.equal(SOURCE_ASPECT, 3392 / 1720)
  const a = projectSourcePoint(0, 0, SOURCE_SIZED)
  const b = projectSourcePoint(1, 1, SOURCE_SIZED)
  assert.ok(a.x > 0 && a.x < SOURCE_SIZED.width * .05)
  assert.ok(a.y > 0 && a.y < SOURCE_SIZED.height * .05)
  assert.ok(b.x > SOURCE_SIZED.width * .95 && b.x < SOURCE_SIZED.width)
  assert.ok(b.y > SOURCE_SIZED.height * .95 && b.y < SOURCE_SIZED.height)
  assert.deepEqual(projectSourcePoint(.5, .5, SOURCE_SIZED), { x: 1696, y: 860 })
})

test('projected rectangles scale linearly and degrade safely for invalid viewports', () => {
  const rect = [.17, .36, .465, .61] as const
  const small = projectSourceRect(rect, DESKTOP)
  const big = projectSourceRect(rect, { width: 3840, height: 2160 })
  for (const key of ['left', 'top', 'width', 'height'] as const) assert.ok(Math.abs(big[key] - small[key] * 2) < 1)
  for (const width of [0, NaN, Infinity]) {
    assert.deepEqual(projectSourceRect(rect, { width, height: 800 }), { left: 0, top: 0, width: 0, height: 0 })
    assert.deepEqual(itemOverlayLayout({ width, height: 800 }, PHOTOS), { boxes: [], insets: [], connectors: [] })
  }
})

test('only authored preferred photos resolve; missing photos never receive substitutions', () => {
  assert.equal(resolvePhotoForObject('cafe-terrace', PHOTOS)?.id, 'rue-christine')
  assert.equal(resolvePhotoForObject('street-lantern', PHOTOS)?.id, 'montmartre')
  assert.equal(resolvePhotoForObject('bistro-chairs', PHOTOS)?.id, 'montparnasse')
  assert.equal(resolvePhotoForObject('stone-paving', PHOTOS)?.id, 'beaubourg')
  assert.equal(resolvePhotoForObject('stop-sign', PHOTOS)?.id, 'clichy')
  assert.equal(resolvePhotoForObject('stop-sign', []), undefined)
  assert.equal(resolvePhotoForObject('unknown', PHOTOS), undefined)
})

test('no selection means eight quiet rectangles, no photos, connectors or active boxes', () => {
  for (const viewport of [DESKTOP, MOBILE]) {
    const layout = itemOverlayLayout(viewport, PHOTOS)
    assert.equal(layout.boxes.length, 8)
    assert.equal(layout.insets.length, 0)
    assert.equal(layout.connectors.length, 0)
    assert.ok(layout.boxes.every(box => !box.active && box.tone !== 'blue'))
  }
})

test('four new stationary bounds are on the right, four original bounds remain on the left', () => {
  const { boxes } = itemOverlayLayout(DESKTOP, PHOTOS)
  assert.ok(boxes.slice(0, 4).every(box => box.left + box.width < DESKTOP.width / 2))
  assert.ok(boxes.slice(4).every(box => box.left > DESKTOP.width / 2))
  const sign = boxes.find(box => box.id === 'stop-sign')!
  assert.ok(sign.top + sign.height < DESKTOP.height * .5, 'sign bounds exclude its pole and the walking people')
})

test('every object can be selected, including on mobile, with at most one matching inset', () => {
  for (const viewport of [DESKTOP, MOBILE]) for (const item of ITEM_OVERLAY_CONTENT) {
    const layout = itemOverlayLayout(viewport, PHOTOS, item.id)
    assert.equal(layout.boxes.length, 8)
    assert.deepEqual(layout.boxes.filter(box => box.active).map(box => box.id), [item.id])
    assert.equal(layout.boxes.find(box => box.active)?.tone, 'blue')
    assert.equal(layout.insets.length, 1)
    assert.equal(layout.insets[0]?.objectId, item.id)
    assert.equal(layout.insets[0]?.photo.id, resolvePhotoForObject(item.id, PHOTOS)?.id)
    assert.equal(layout.connectors.length, 1)
    assert.equal(layout.connectors[0]?.objectId, item.id)
  }
})

test('missing or failed context images do not hide the selected object information', () => {
  const layout = itemOverlayLayout(DESKTOP, [], 'stop-sign')
  assert.equal(layout.boxes.find(box => box.id === 'stop-sign')?.active, true)
  assert.equal(layout.insets.length, 0)
  assert.equal(layout.connectors.length, 0)
})

test('unknown selection cannot create information or arbitrary photo references', () => {
  assert.deepEqual(itemOverlayLayout(DESKTOP, PHOTOS, 'untrusted'), itemOverlayLayout(DESKTOP, PHOTOS))
})

test('selection never changes object geometry and repeated layout is deterministic', () => {
  const geometry = (id: string | null) => itemOverlayLayout(DESKTOP, PHOTOS, id).boxes.map(({ id, left, top, width, height }) => ({ id, left, top, width, height }))
  for (const item of ITEM_OVERLAY_CONTENT) assert.deepEqual(geometry(item.id), geometry(null))
  assert.deepEqual(itemOverlayLayout(MOBILE, PHOTOS, 'stop-sign'), itemOverlayLayout(MOBILE, PHOTOS, 'stop-sign'))
})

test('all bounds and selected insets clear the viewport and reserved prompt zone', () => {
  for (const viewport of [DESKTOP, MOBILE, { width: 2560, height: 1440 }, { width: 1024, height: 700 }]) {
    for (const item of ITEM_OVERLAY_CONTENT) {
      const layout = itemOverlayLayout(viewport, PHOTOS, item.id)
      for (const box of [...layout.boxes, ...layout.insets]) {
        assert.ok(box.left >= 0 && box.left + box.width <= viewport.width + 1)
        assert.ok(box.top >= 0 && box.top + box.height <= viewport.height - 99)
      }
      for (const line of layout.connectors) assert.ok([line.left, line.top, line.length, line.angleDeg].every(Number.isFinite))
    }
  }
})
