import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildFilterGraph, encodeFrameRate } from './exportGraph.ts'
import { exportSamples, stillLayers, stillSpans } from './stillLayers.ts'
import { parseUserTime } from './format.ts'
import { snapRange, snapTime } from './snap.ts'
import { parseTimestamp } from './timestamp.ts'
import { assignDurations, clipAtTime, deriveNotices, makeClip, videoSlotNote, withTrim } from './timeline.ts'
import { frameRect, kenBurnsScale, outputSize } from './transform.ts'
import type { Clip } from '../types/project.ts'

test('parses minute-second filenames', () => {
  assert.equal(parseTimestamp('0-00.png'), 0)
  assert.equal(parseTimestamp('0-03.png'), 3)
  assert.equal(parseTimestamp('0-07.png'), 7)
  assert.equal(parseTimestamp('0-16.mp4'), 16)
  assert.equal(parseTimestamp('1-03.png'), 63)
  assert.equal(parseTimestamp('1-15.mp4'), 75)
  assert.equal(parseTimestamp('10-05.png'), 605)
  assert.equal(parseTimestamp('0-3.png'), 3)
  assert.equal(parseTimestamp('folder/0-21.png'), 21)
  assert.equal(parseTimestamp('character.png'), null)
  assert.equal(parseTimestamp('0-75.png'), null)
  assert.equal(parseTimestamp('scene-0-03.png'), null)
})

test('sorts visuals and sizes each one to the next timestamp', () => {
  const names = ['0-21.png', '0-03.png', '0-14.mp4', '0-07.png']
  const clips = names.map((name, index) =>
    sampleClip({
      id: String(index),
      name,
      type: name.endsWith('.mp4') ? 'video' : 'image',
      startTime: parseTimestamp(name) ?? 0,
      sourceDuration: name.endsWith('.mp4') ? 30 : null,
    }),
  )
  const placed = assignDurations(clips, 40)
  assert.deepEqual(
    placed.map((clip) => [clip.name, clip.startTime, clip.duration]),
    [
      ['0-03.png', 3, 4],
      ['0-07.png', 7, 7],
      ['0-14.mp4', 14, 7],
      ['0-21.png', 21, 19],
    ],
  )
})

test('the last visual runs to the end of the voiceover', () => {
  const clips = ['0-00.png', '0-04.png', '0-09.png', '0-14.mp4', '0-21.png', '0-28.png'].map(
    (name, index) =>
      sampleClip({
        id: String(index),
        name,
        type: name.endsWith('.mp4') ? 'video' : 'image',
        startTime: parseTimestamp(name) ?? 0,
        sourceDuration: name.endsWith('.mp4') ? 2 : null,
      }),
  )
  const placed = assignDurations(clips, 40)
  assert.deepEqual(
    placed.map((clip) => [clip.startTime, clip.duration]),
    [
      [0, 4],
      [4, 5],
      [9, 5],
      [14, 7],
      [21, 7],
      [28, 12],
    ],
  )
  const video = placed.find((clip) => clip.name === '0-14.mp4')
  assert.ok(video)
  assert.equal(videoSlotNote(video), 'holds')
  const last = placed.at(-1)
  assert.ok(last)
  assert.equal(clipAtTime(placed, 0)?.name, '0-00.png')
  assert.equal(clipAtTime(placed, 4)?.name, '0-04.png')
  assert.equal(clipAtTime(placed, 40)?.name, last.name)
})

test('reports duplicate timestamps and trimmed video', () => {
  const image = sampleClip({ id: 'a', name: '0-03.png', startTime: 3, duration: 4 })
  const video = sampleClip({
    id: 'b',
    name: '0-03.mp4',
    type: 'video',
    startTime: 3,
    duration: 4,
    sourceDuration: 12,
  })
  const notices = deriveNotices([image, video], [
    {
      id: 'u',
      name: 'character.png',
      kind: 'image',
      reason: '“character.png” has no timestamp. Name it like 0-03.png, or place it manually.',
      url: null,
      thumbnailUrl: null,
      file: null,
      mimeType: 'image/png',
      width: 0,
      height: 0,
      sourceDuration: null,
    },
  ])
  assert.equal(notices.some((notice) => notice.message.includes('character.png')), true)
  assert.equal(notices.some((notice) => notice.message.includes('added twice')), true)
  assert.equal(videoSlotNote(video), 'trimmed')
  assert.equal(notices.some((notice) => notice.message.includes('trimmed')), true)
})

test('manual trim leaves auto placement', () => {
  const clip = sampleClip({ id: 'a', name: '0-03.png', startTime: 3, duration: 4, auto: true })
  const trimmed = withTrim(clip, 'end', 6)
  assert.equal(trimmed.duration, 3)
  assert.equal(trimmed.auto, false)
  const kept = assignDurations([trimmed, sampleClip({ id: 'b', name: '0-10.png', startTime: 10 })], 20)
  assert.equal(kept[0]?.duration, 3)
  assert.equal(kept[1]?.duration, 10)
})

test('frame placement fits and fills', () => {
  const fitted = frameRect(1000, 1000, 'fit', 1, 0, 0)
  assert.equal(fitted.width, 1080)
  assert.equal(fitted.height, 1080)
  assert.equal(fitted.x, 420)
  assert.equal(fitted.y, 0)
  const filled = frameRect(1000, 1000, 'fill', 1, 0, 0)
  assert.equal(filled.width, 1920)
  assert.equal(filled.height, 1920)
  assert.equal(filled.y, -420)
})

test('snaps the nearer clip edge', () => {
  assert.equal(snapTime(3.1, [0, 3, 8], 0.2), 3)
  assert.equal(snapRange(2.9, 4, [0, 7], 0.2), 3)
})

test('parses typed times', () => {
  assert.equal(parseUserTime('1:15'), 75)
  assert.equal(parseUserTime('1-15'), 75)
  assert.equal(parseUserTime('12.5'), 12.5)
  assert.equal(parseUserTime('0:75'), null)
})

test('export graph places the voiceover and the visual', () => {
  const graph = buildFilterGraph(
    [
      {
        type: 'image',
        start: 3,
        duration: 4,
        trimStart: 0,
        sourceDuration: null,
        width: 1920,
        height: 1080,
        scale: 1,
        positionX: 0,
        positionY: 0,
        fit: 'fill',
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        hasAudio: false,
      },
    ],
    10,
    1,
    0.15,
  )
  assert.match(graph, /overlay=/)
  assert.match(graph, /scale=1920:1080/)
  assert.match(graph, /\[aout\]/)
  assert.match(graph, /volume=1\.000/)
  assert.doesNotMatch(graph, /amix/)
})

test('slow zoom grows across the clip and the export uses it', () => {
  assert.equal(kenBurnsScale(0, 0.08, 'in'), 1)
  assert.ok(Math.abs(kenBurnsScale(1, 0.08, 'in') - 1.08) < 0.0001)
  assert.ok(Math.abs(kenBurnsScale(0, 0.08, 'out') - 1.08) < 0.0001)
  assert.deepEqual(outputSize('9:16', 'full'), { width: 1080, height: 1920 })
  const graph = buildFilterGraph(
    [
      {
        type: 'image',
        start: 0,
        duration: 4,
        trimStart: 0,
        sourceDuration: null,
        width: 1920,
        height: 1080,
        scale: 1,
        positionX: 0,
        positionY: 0,
        fit: 'fill',
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        hasAudio: false,
      },
    ],
    4,
    1,
    0,
    { zoomDepth: 0.08, zoomDirection: 'in', width: 1920, height: 1080, fps: 30 },
  )
  assert.match(graph, /crop=w=/)
  assert.doesNotMatch(graph, /zoompan=/)
  assert.equal(
    encodeFrameRate({ fps: 30, hasVideo: false, zoomDepth: 0, crossfade: 0, effect: 'none' }),
    1,
  )
  assert.equal(
    encodeFrameRate({ fps: 30, hasVideo: false, zoomDepth: 0.08, crossfade: 0, effect: 'none' }),
    8,
  )
  assert.equal(
    encodeFrameRate({ fps: 24, hasVideo: true, zoomDepth: 0, crossfade: 0, effect: 'none' }),
    24,
  )
})

test('export spans cover the voiceover', () => {
  const spans = stillSpans(
    [
      { startTime: 0, duration: 4 },
      { startTime: 4, duration: 6 },
    ],
    10,
  )
  assert.equal(spans[0]?.start, 0)
  assert.equal(spans[0]?.end, 4)
  assert.equal(spans.at(-1)?.end, 10)
  assert.ok(spans.every((span, index) => index === 0 || span.start === spans[index - 1]?.end))
})

test('export spans follow each picture inside the voiceover', () => {
  assert.deepEqual(
    stillSpans(
      [
        { startTime: 0, duration: 4 },
        { startTime: 4, duration: 6 },
      ],
      10,
    ),
    [
      { start: 0, end: 4 },
      { start: 4, end: 10 },
    ],
  )
})

test('a still slideshow is one frame per picture', () => {
  const clips = [
    { startTime: 0, duration: 4 },
    { startTime: 4, duration: 6 },
  ]
  const still = exportSamples(clips, 10, { zoom: false, crossfade: 0, animated: false })
  assert.equal(still.length, 2)
  assert.equal(still[0]?.duration, 4)
  const zoomed = exportSamples([{ startTime: 0, duration: 10 }], 10, {
    zoom: true,
    crossfade: 0,
    animated: false,
    frameRate: 30,
  })
  assert.ok(Math.abs(zoomed.length - 300) <= 2)
  assert.ok((zoomed[0]?.duration ?? 1) < 0.04)
  const dissolved = exportSamples(clips, 10, { zoom: false, crossfade: 0.35, animated: false })
  assert.ok(dissolved.length > 2)
  assert.ok(dissolved.length < 20)
})

test('a dissolve keeps the previous picture under the next one', () => {
  const clips = [
    sampleClip({ id: 'a', name: '0-00.png', startTime: 0, duration: 4 }),
    sampleClip({ id: 'b', name: '0-04.png', startTime: 4, duration: 6 }),
  ]
  const open = stillLayers(clips, 4.1, 0.35)
  assert.equal(open.length, 2)
  assert.equal(open[0]?.clip.id, 'a')
  assert.equal(open[0]?.alpha, 1)
  assert.equal(open[1]?.clip.id, 'b')
  assert.ok((open[1]?.alpha ?? 0) > 0.2 && (open[1]?.alpha ?? 1) < 0.4)
  const settled = stillLayers(clips, 4.5, 0.35)
  assert.equal(settled.length, 1)
  assert.equal(settled[0]?.clip.id, 'b')
  assert.equal(stillLayers(clips, 1, 0).length, 1)
  assert.equal(stillLayers(clips, 20, 0.35).length, 0)
})

test('snow is applied to the finished picture', () => {
  const graph = buildFilterGraph([], 4, 1, 0, { effect: 'snow' })
  assert.match(graph, /blend=all_mode=screen/)
  assert.match(graph, /\[graded\]format=yuv420p\[vout\]/)
})

function sampleClip(overrides: Partial<Clip> & Pick<Clip, 'id' | 'name'>): Clip {
  const clip = makeClip({
    id: overrides.id,
    type: overrides.type ?? 'image',
    name: overrides.name,
    mimeType: 'image/png',
    url: `blob:${overrides.id}`,
    thumbnailUrl: null,
    file: new Blob(['x']),
    startTime: overrides.startTime ?? 0,
    sourceDuration: overrides.sourceDuration ?? null,
    width: overrides.width ?? 1920,
    height: overrides.height ?? 1080,
  })
  return { ...clip, ...overrides, file: clip.file }
}
