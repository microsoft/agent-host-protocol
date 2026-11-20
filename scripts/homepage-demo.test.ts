import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SessionDemo, clientIds, optimisticState, routePoint, routes } from '../docs/.vitepress/theme/demo.js'
import { ActionType } from '../types/common/actions.js'

function manualDemo(): SessionDemo {
  const demo = new SessionDemo()
  demo.autoplay = false
  return demo
}

test('optimistic messages confirm exactly at the configured round-trip latency', () => {
  for (const latency of [250, 500, 1000, 2000]) {
    const demo = manualDemo()
    demo.setLatency(latency)
    assert.equal(demo.send('IDE', 'Hello from the IDE'), true)
    assert.equal(optimisticState(demo.mirrors.IDE).activeTurn?.message.text, 'Hello from the IDE')
    assert.equal(demo.host.activeTurn, undefined)
    assert.equal(demo.packets.length, 1)
    assert.equal(demo.packets[0].end - demo.packets[0].start, latency / 2)
    demo.advance(latency / 2 - 1)
    assert.equal(demo.host.activeTurn, undefined)
    demo.advance(1)
    assert.equal(demo.host.activeTurn?.message.text, 'Hello from the IDE')
    assert.equal(demo.mirrors.IDE.pending.length, 1)
    const echoes = demo.packets.filter(packet => packet.action === ActionType.ChatTurnStarted)
    assert.deepEqual(echoes.map(packet => packet.client), [...clientIds])
    assert.ok(echoes.every(packet => packet.direction === 'out' && packet.end - packet.start === latency / 2))
    demo.advance(latency / 2 - 1)
    assert.equal(demo.mirrors.IDE.pending.length, 1)
    demo.advance(1)
    assert.equal(demo.mirrors.IDE.pending.length, 0)
    for (const client of clientIds) {
      assert.equal(demo.mirrors[client].confirmed.activeTurn?.message.text, 'Hello from the IDE')
      assert.deepEqual(demo.mirrors[client].lastEnvelope?.origin, { clientId: 'IDE', clientSeq: 2 })
    }
  }
})

test('every delivered action converges through canonical reducers, including tools and completion', () => {
  const demo = manualDemo()
  demo.send('CLI', 'Follow the state')
  demo.advance(15000)
  assert.equal(demo.host.activeTurn, undefined)
  assert.equal(demo.host.turns.length, 1)
  assert.equal(demo.serverSeq, 8)
  assert.equal(demo.packets.length, 0)
  for (const client of clientIds) {
    assert.deepEqual(demo.mirrors[client].confirmed, demo.host)
    assert.equal(demo.mirrors[client].pending.length, 0)
    assert.equal(demo.mirrors[client].lastEnvelope?.action.type, ActionType.ChatTurnComplete)
    assert.equal(demo.mirrors[client].lastEnvelope?.origin, undefined)
  }
})

test('pause freezes transport, optimistic pending state and packet positions without losing deliveries', () => {
  const demo = manualDemo()
  demo.send('Web', 'Pause me')
  demo.advance(250)
  const packets = structuredClone(demo.packets)
  demo.playing = false
  demo.advance(10000)
  assert.equal(demo.now, 250)
  assert.deepEqual(demo.packets, packets)
  assert.equal(demo.mirrors.Web.pending.length, 1)
  assert.equal(demo.send('IDE', 'Not while paused'), false)
  demo.playing = true
  demo.advance(749)
  assert.equal(demo.mirrors.Web.pending.length, 1)
  demo.advance(1)
  assert.equal(demo.mirrors.Web.pending.length, 0)
})

test('cancellation is optimistic, travels through transport and invalidates future agent events', () => {
  const demo = manualDemo()
  demo.send('IDE', 'Cancel this turn')
  demo.advance(1000)
  assert.equal(demo.cancel('IDE'), true)
  assert.equal(optimisticState(demo.mirrors.IDE).activeTurn, undefined)
  assert.equal(demo.mirrors.IDE.pending.length, 1)
  assert.equal(demo.cancel('CLI'), false)
  demo.advance(999)
  assert.equal(demo.mirrors.IDE.pending.length, 1)
  demo.advance(1)
  assert.equal(demo.mirrors.IDE.pending.length, 0)
  demo.advance(15000)
  assert.equal(demo.host.activeTurn, undefined)
  for (const client of clientIds) assert.deepEqual(demo.mirrors[client].confirmed, demo.host)
  assert.equal(demo.mirrors.IDE.lastEnvelope?.action.type, ActionType.ChatTurnCancelled)
})

test('autoplay dispatches from each real client mirror without overlapping turns', () => {
  const demo = new SessionDemo()
  demo.advance(1799)
  assert.equal(demo.packets.length, 0)
  demo.advance(1)
  assert.equal(demo.packets[0].client, 'IDE')
  assert.equal(demo.send('Web', 'Concurrent turn'), false)
  demo.advance(12000)
  assert.equal(demo.packets[0].client, 'CLI')
  demo.advance(12000)
  assert.equal(demo.packets[0].client, 'Web')
})

test('latency changes reject invalid values and cannot retime in-flight actions', () => {
  const demo = manualDemo()
  assert.throws(() => demo.setLatency(0), /Unsupported/)
  demo.send('Web', 'Latency is captured')
  assert.throws(() => demo.setLatency(2000), /current turn/)
  assert.throws(() => demo.advance(-1), /Invalid/)
  assert.throws(() => demo.advance(Number.NaN), /Invalid/)
})

test('route positions follow equal-distance orthogonal paths with exact endpoints', () => {
  assert.deepEqual(routePoint([[0, 0], [10, 0], [10, 30]], 0.5), [10, 10])
  for (const client of clientIds) {
    for (const direction of ['in', 'out'] as const) {
      const points = routes[client][direction]
      assert.deepEqual(routePoint(points, 0), points[0])
      assert.deepEqual(routePoint(points, 1), points.at(-1))
    }
  }
})
