import assert from 'node:assert/strict'
import { test } from 'node:test'
import { converged, deviceIds, optimisticState, pickActiveStep, stateDigest } from '../docs/.vitepress/theme/notebook.js'
import {
  baseSize, chapterBySlug, chapterStart, chapterStops, chapters, chatFrame, clampStop, deviceSeq, features, finalChapter, hostSeq,
  lastStop, planeSize, sceneBoxes, stopDiff, stops, stopWire, visibleDevices,
} from '../docs/.vitepress/theme/notebook-story.js'
import type { Layout } from '../docs/.vitepress/theme/notebook-story.js'
import { ReconnectResultType } from '../types/common/commands.js'

test('four short chapters map onto a cover plus a bounded list of stops', () => {
  assert.equal(chapters.length, 4)
  assert.deepEqual(chapters.map(chapter => chapter.number), [1, 2, 3, 4])
  assert.equal(finalChapter, 4)
  assert.equal(stops[0].chapter, 0)
  assert.ok(stops.length <= 12)
  assert.equal(lastStop, stops.length - 1)
  // Chapters are contiguous and each starts at sub-step 0.
  for (const chapter of chapters) {
    const own = chapterStops(chapter.number)
    assert.ok(own.length >= 1 && own.length <= 4, chapter.slug)
    assert.equal(chapterStart(chapter.number), own[0].index)
    assert.deepEqual(own.map(stop => stop.sub), own.map((_, index) => index))
    assert.deepEqual(own.map(stop => stop.index), own.map((_, index) => own[0].index + index))
    assert.equal(chapterBySlug(chapter.slug), chapter)
  }
  assert.deepEqual([...new Set(stops.map(stop => stop.chapter))], [0, 1, 2, 3, 4])
  assert.equal(new Set(stops.map(stop => stop.slug)).size, stops.length)
  // Reconnection is one chapter, not a run of separate ones.
  assert.deepEqual(chapterStops(2).map(stop => stop.slug), ['link-drops', 'host-advances', 'replay'])
  // Extensibility shows one screen per channel family.
  assert.deepEqual(chapterStops(3).map(stop => stop.slug), ['run-running', 'take-over', 'host-offers-less'])
  assert.throws(() => chapterStart(9))
  assert.equal(chapterBySlug('nope'), undefined)
})

test('prev, next and direct jumps clamp and land on the same derived state in any order', () => {
  assert.equal(clampStop(-1), 0)
  assert.equal(clampStop(3.9), 3)
  assert.equal(clampStop(999), lastStop)
  assert.equal(clampStop(Number.NaN), 0)
  const derive = (index: number) => {
    const stop = stops[clampStop(index)]
    return JSON.stringify({ stop, wire: stopWire(stop), diff: stopDiff(stop), host: hostSeq(stop), seqs: deviceIds.map(id => deviceSeq(stop, id)), features: features(stop) })
  }
  const reference = stops.map(stop => derive(stop.index))
  const path = [chapterStart(4), chapterStart(2) + 2, 0, chapterStart(3), chapterStart(3) - 1, chapterStart(3), lastStop, 2]
  for (const index of path) assert.equal(derive(index), reference[index])
  let cursor = 0
  for (let index = 0; index < lastStop; index++) cursor = clampStop(cursor + 1)
  assert.equal(cursor, lastStop)
  for (let index = 0; index < lastStop; index++) cursor = clampStop(cursor - 1)
  assert.equal(cursor, 0)
  // Scroll checkpoints: the active stop is the last marker above the reading line.
  assert.equal(pickActiveStep(stops.map((_, index) => index * 500 - 1200), 400), 3)
})

test('devices enter and exit by chapter: one desktop for single-screen points, the phone for reconnect', () => {
  const shown = (slug: string) => visibleDevices(stops.find(stop => stop.slug === slug)!)
  assert.deepEqual(shown('cover'), ['desktop', 'tablet', 'phone'])
  assert.deepEqual(shown('optimistic'), ['desktop'])
  for (const stop of chapterStops(2)) assert.deepEqual(visibleDevices(stop), ['desktop', 'phone'])
  assert.deepEqual(shown('run-running'), ['desktop', 'tablet'])
  assert.deepEqual(shown('take-over'), ['desktop'])
  assert.deepEqual(shown('host-offers-less'), ['desktop'])
  assert.deepEqual(shown('any-client'), ['desktop', 'tablet', 'phone'])
  for (const stop of stops) assert.ok(visibleDevices(stop).includes(stop.focus), stop.slug)
})

test('every scene fits inside the plane without devices overlapping each other or the host rail', () => {
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  for (const layout of ['full', 'compact'] as Layout[]) {
    const plane = planeSize[layout]
    for (const stop of stops) {
      const visible = visibleDevices(stop)
      const boxes = sceneBoxes(stop.scene, layout, visible)
      const rail = boxes.rail
      assert.ok(rail.x >= 0 && rail.y >= 0 && rail.x + rail.width <= plane.width && rail.y + rail.height <= plane.height, `${layout} ${stop.slug} rail`)
      const shown = visible.map(id => ({ id, box: boxes.devices[id] }))
      for (const { id, box } of shown) {
        const label = `${layout} ${stop.slug} ${id}`
        assert.ok(box.visible, label)
        assert.ok(Math.abs(box.width - baseSize[layout][id].width * box.scale) < 1, label)
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= plane.width + 0.5 && box.y + box.height <= plane.height + 0.5, label)
        assert.ok(!overlaps(box, rail), `${label} overlaps rail`)
      }
      for (let a = 0; a < shown.length; a++) {
        for (let b = a + 1; b < shown.length; b++) assert.ok(!overlaps(shown[a].box, shown[b].box), `${layout} ${stop.slug} ${shown[a].id}/${shown[b].id}`)
      }
      for (const id of deviceIds.filter(id => !visible.includes(id))) assert.equal(boxes.devices[id].visible, false)
    }
  }
})

test('the reconnect chapter really replays the missed actions in order and converges the phone', () => {
  const replayStop = stops.find(stop => stop.slug === 'replay')!
  const replay = chatFrame(replayStop)
  // The merged stop shows the reconnect request alongside its response.
  assert.deepEqual(stopWire(replayStop).map(record => (record.message as { method?: string }).method ?? 'result'), ['reconnect', 'result'])
  const reply = replay.wire.find(record => record.label.includes('result'))!.message as { result: { type: string; actions: { serverSeq: number }[] } }
  assert.equal(reply.result.type, ReconnectResultType.Replay)
  assert.deepEqual(reply.result.actions.map(action => action.serverSeq), [46, 47, 48, 49])
  assert.ok(replay.wire.every(record => !(record.message as { method?: string }).method?.startsWith('notify/')))
  const phone = replay.devices.phone
  assert.equal(phone.link, 'connected')
  assert.deepEqual(phone.pending, [])
  assert.equal(phone.lastSeenServerSeq, 49)
  assert.ok(converged(phone, replay.host))
  assert.equal(stateDigest(optimisticState(phone)), stateDigest(replay.host))

  const before = chatFrame(stops.find(stop => stop.slug === 'host-advances')!)
  assert.equal(before.devices.phone.lastSeenServerSeq, 45)
  assert.equal(before.devices.phone.pending.length, 1)
  assert.notEqual(stateDigest(before.devices.phone.confirmed), stateDigest(before.host))
  // The host rail and device badges follow the same numbers.
  assert.equal(hostSeq(stops.find(stop => stop.slug === 'replay')!), 49)
  assert.equal(deviceSeq(stops.find(stop => stop.slug === 'host-advances')!, 'phone'), 45)
})

test('each chapter stop carries opt-in wire details', () => {
  for (const stop of stops) {
    if (stop.chapter > 0 && stop.chapter < finalChapter) assert.ok(stopWire(stop).length >= 1, stop.slug)
  }
  const negotiation = features(stops.find(stop => stop.slug === 'host-offers-less')!)!
  assert.equal(negotiation.protocolVersion, '1.0.0')
  assert.equal(negotiation.rows.find(row => row.family === 'automations')!.offered, false)
})
