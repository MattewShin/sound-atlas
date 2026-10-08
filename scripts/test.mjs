import './emma/emma.test.js'
import '../src/data/recommendation.test.js'
import '../src/data/storage.test.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, unlinkSync } from 'node:fs'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { emotions, formatTrackTitle } from '../src/data/emotions.js'
import { composerImages, tracks, trackDetails } from '../src/data/musicData.js'
import { getLibraryPreferenceProfile } from '../src/data/recommendations.js'

// JSX를 실제 컴파일해 화면의 렌더링 경로와 카탈로그 연결을 확인합니다.
const compiledPath = new URL('../src/.App.ssr.local.mjs', import.meta.url)
let components
try {
  const result = await build({ entryPoints: ['src/App.jsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false })
  writeFileSync(compiledPath, result.outputFiles[0].text)
  components = await import(compiledPath.href)
} finally {
  try { unlinkSync(compiledPath) } catch { /* 컴파일 실패 시 파일 없음 */ }
}
const render = (component, props = {}) => renderToStaticMarkup(React.createElement(component, props))
test('첫 화면에는 새 9개 선택과 활성곡만 있으며 Energy 선택은 없다', () => {
  const html = render(components.default)
  emotions.forEach(({ label }) => assert.ok(html.includes(label)))
  assert.ok(html.includes('느낌으로 시작하기') && html.includes('기분에서 시작하기'))
  assert.ok(html.includes('쇼팽 연습곡 Op.10 No.3'))
  assert.ok(html.includes('별칭: 이별의 곡'))
  assert.ok(!/ENERGY|얼마나 깊게|강렬하게|베토벤|녹턴/.test(html))
})
test('44곡 상세·보관함은 정식 제목, 별칭, 9개 점수, 공용 이미지를 렌더링한다', () => {
  for (const track of tracks) {
    const html = render(components.TrackDetailSheet, { track, detail: trackDetails[track.id], selectedKeys: [], isOpen: true })
    assert.ok(html.includes(formatTrackTitle(track)))
    assert.equal((html.match(/<dt>/g) ?? []).length, 9)
    assert.ok(html.includes('미리듣기 준비 중'))
    assert.ok(html.includes(composerImages[track.composer]))
    assert.ok(!html.includes('<iframe'))
    if (track.movement) assert.equal((html.match(new RegExp(track.movement, 'g')) ?? []).length, 1)
    if (track.alias) assert.ok(html.includes('별칭: ' + track.alias))
  }
  const library = render(components.LibraryScreen, { savedTracks: tracks })
  assert.equal((library.match(/class="saved-track-card/g) ?? []).length, tracks.length)
  assert.ok(!/베토벤|녹턴/.test(library))
  tracks.slice(36).forEach((track) => assert.ok(library.includes(formatTrackTitle(track))))
  const missing = render(components.TrackDetailSheet, { track: { ...tracks[0], emotionScores: undefined }, selectedKeys: [], isOpen: true })
  assert.equal((missing.match(/미평가/g) ?? []).length, 9)
  assert.ok(missing.includes('평가 검토 중'))
})
test('취향 미형성에는 차트를 만들지 않고 활성 프로필은 9개 고정 축을 사용한다', () => {
  const empty = render(components.PreferenceScreen, { profile: getLibraryPreferenceProfile(tracks, []) })
  assert.ok(empty.includes('아직 취향이 형성되지'))
  assert.ok(!empty.includes('<meter'))
  const html = render(components.PreferenceScreen, { profile: getLibraryPreferenceProfile(tracks, [tracks[0].id]) })
  assert.equal((html.match(/<meter/g) ?? []).length, 9)
  assert.equal((html.match(/min="0" max="100"/g) ?? []).length, 9)
  assert.ok(html.includes('초기 취향') && html.includes('(공동)'))
})
